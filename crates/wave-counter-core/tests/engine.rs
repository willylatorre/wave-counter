use std::{collections::HashMap, sync::Arc, thread, time::Duration};

use chrono::{TimeZone, Utc};
use rusqlite::Connection;
use tempfile::tempdir;
use wave_counter_core::{AnalyticsWindow, Config, ErrorCode, WaveCounter};

fn test_counter() -> (tempfile::TempDir, WaveCounter) {
    let directory = tempdir().expect("temporary directory");
    let counter = WaveCounter::open(Config::new(directory.path().join("waves.sqlite3")))
        .expect("counter opens");
    (directory, counter)
}

fn event_id(timestamp_millis: u64) -> String {
    uuid::Uuid::new_v7(uuid::Timestamp::from_unix(
        uuid::NoContext,
        timestamp_millis / 1_000,
        ((timestamp_millis % 1_000) * 1_000_000) as u32,
    ))
    .to_string()
}

#[test]
fn rejects_invalid_counter_keys() {
    let (_directory, counter) = test_counter();

    for key in ["", "Coffee", "-coffee", "coffee!", &"a".repeat(65)] {
        let error = counter.get_counter(key).expect_err("key is invalid");
        assert_eq!(error.code(), ErrorCode::InvalidCounterKey);
    }
}

#[test]
fn reads_an_unknown_counter_as_virtual_zero() {
    let (_directory, counter) = test_counter();

    let snapshot = counter.get_counter("coffee").expect("counter snapshot");

    assert_eq!(snapshot.key, "coffee");
    assert_eq!(snapshot.total, 0);
    assert_eq!(snapshot.updated_at, None);
}

#[test]
fn records_an_event_and_replays_it_idempotently() {
    let (_directory, counter) = test_counter();
    let now = Utc.with_ymd_and_hms(2026, 7, 10, 13, 42, 0).unwrap();
    let id = event_id(now.timestamp_millis() as u64);

    let first = counter
        .record_event_at("coffee", &id, now)
        .expect("first event");
    let replay = counter
        .record_event_at("coffee", &id, now + chrono::Duration::seconds(1))
        .expect("idempotent replay");

    assert!(first.created);
    assert!(!replay.created);
    assert_eq!(first.counter.total, 1);
    assert_eq!(replay.counter.total, 1);
    assert_eq!(replay.counter.updated_at, Some(now));
}

#[test]
fn rejects_non_v7_event_ids() {
    let (_directory, counter) = test_counter();
    let error = counter
        .record_event("coffee", "550e8400-e29b-41d4-a716-446655440000")
        .expect_err("v4 is invalid");

    assert_eq!(error.code(), ErrorCode::InvalidEventId);
}

#[test]
fn applies_a_baseline_once_without_fabricating_events() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("waves.sqlite3");
    let initial_counts = HashMap::from([("coffee".to_owned(), 67)]);
    let counter = WaveCounter::open(Config::new(&path).with_initial_counts(initial_counts))
        .expect("counter opens");

    assert_eq!(counter.get_counter("coffee").unwrap().total, 67);
    let id = event_id(1_783_691_000_000);
    assert_eq!(
        counter.record_event("coffee", &id).unwrap().counter.total,
        68
    );

    let reopened = WaveCounter::open(
        Config::new(&path).with_initial_counts(HashMap::from([("coffee".to_owned(), 999)])),
    )
    .expect("counter reopens");
    assert_eq!(reopened.get_counter("coffee").unwrap().total, 68);
}

#[test]
fn returns_seven_utc_buckets_and_previous_period_comparison() {
    let (_directory, counter) = test_counter();
    let now = Utc.with_ymd_and_hms(2026, 7, 10, 13, 42, 0).unwrap();
    let timestamps = [
        Utc.with_ymd_and_hms(2026, 6, 27, 12, 0, 0).unwrap(),
        Utc.with_ymd_and_hms(2026, 7, 3, 23, 59, 59).unwrap(),
        Utc.with_ymd_and_hms(2026, 7, 4, 0, 0, 0).unwrap(),
        Utc.with_ymd_and_hms(2026, 7, 4, 11, 0, 0).unwrap(),
        Utc.with_ymd_and_hms(2026, 7, 10, 13, 41, 59).unwrap(),
    ];
    for timestamp in timestamps {
        counter
            .record_event_at(
                "coffee",
                &event_id(timestamp.timestamp_millis() as u64),
                timestamp,
            )
            .unwrap();
    }

    let analytics = counter
        .analytics("coffee", AnalyticsWindow::SevenDays, now)
        .expect("analytics");

    assert_eq!(analytics.total, 3);
    assert_eq!(analytics.previous_total, 2);
    assert_eq!(analytics.change_percentage, Some(50.0));
    assert_eq!(analytics.points.len(), 7);
    assert_eq!(
        analytics.points[0].start.to_rfc3339(),
        "2026-07-04T00:00:00+00:00"
    );
    assert_eq!(analytics.points[0].count, 2);
    assert_eq!(analytics.points[6].count, 1);
}

#[test]
fn uses_namespaced_tables_foreign_keys_and_wal() {
    let (directory, _counter) = test_counter();
    let connection = Connection::open(directory.path().join("waves.sqlite3")).unwrap();
    let journal_mode: String = connection
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .unwrap();
    let table_names: Vec<String> = connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();

    assert_eq!(journal_mode, "wal");
    assert!(table_names.contains(&"waves_counters".to_owned()));
    assert!(table_names.contains(&"waves_events".to_owned()));
    assert!(table_names.contains(&"waves_migrations".to_owned()));
    assert!(table_names.iter().all(|name| name.starts_with("waves_")));
}

#[test]
fn concurrent_increments_do_not_lose_events() {
    let (_directory, counter) = test_counter();
    let counter = Arc::new(counter);
    let handles: Vec<_> = (0..24)
        .map(|index| {
            let counter = Arc::clone(&counter);
            thread::spawn(move || {
                counter
                    .record_event("waves", &event_id(1_783_691_000_000 + index))
                    .expect("event records")
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("thread completes");
    }

    assert_eq!(counter.get_counter("waves").unwrap().total, 24);
}

#[test]
fn maps_lock_timeout_to_busy_error() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("waves.sqlite3");
    let counter = WaveCounter::open(Config::new(&path).with_busy_timeout(Duration::from_millis(5)))
        .expect("counter opens");
    let blocker = Connection::open(&path).unwrap();
    blocker.execute_batch("BEGIN IMMEDIATE").unwrap();

    let error = counter
        .record_event("coffee", &event_id(1_783_691_000_000))
        .expect_err("write remains locked");

    assert_eq!(error.code(), ErrorCode::Busy);
}
