use std::{collections::HashMap, path::PathBuf, time::Duration};

use chrono::{DateTime, Duration as ChronoDuration, TimeZone, Utc};
use rusqlite::{Connection, OpenFlags, OptionalExtension, TransactionBehavior, params};

use crate::{
    Analytics, AnalyticsPoint, AnalyticsWindow, CounterSnapshot, RecordEventResult,
    error::{Result, WaveCounterError},
    validation,
};

const MIGRATION: &str = r#"
CREATE TABLE IF NOT EXISTS waves_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS waves_counters (
    key TEXT PRIMARY KEY,
    baseline_count INTEGER NOT NULL DEFAULT 0 CHECK (baseline_count >= 0),
    event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS waves_events (
    id TEXT PRIMARY KEY,
    counter_key TEXT NOT NULL REFERENCES waves_counters(key),
    occurred_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS waves_events_counter_occurred_at
    ON waves_events(counter_key, occurred_at);
"#;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_path: PathBuf,
    pub initial_counts: HashMap<String, u64>,
    pub busy_timeout: Duration,
}

impl Config {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            database_path: path.into(),
            initial_counts: HashMap::new(),
            busy_timeout: Duration::from_secs(5),
        }
    }

    #[must_use]
    pub fn with_initial_counts(mut self, initial_counts: HashMap<String, u64>) -> Self {
        self.initial_counts = initial_counts;
        self
    }

    #[must_use]
    pub const fn with_busy_timeout(mut self, busy_timeout: Duration) -> Self {
        self.busy_timeout = busy_timeout;
        self
    }
}

impl Default for Config {
    fn default() -> Self {
        Self::new("./wave-counter.sqlite3")
    }
}

#[derive(Debug, Clone)]
pub struct WaveCounter {
    database_path: PathBuf,
    busy_timeout: Duration,
}

impl WaveCounter {
    pub fn open(config: Config) -> Result<Self> {
        for (key, total) in &config.initial_counts {
            validation::counter_key(key)?;
            i64::try_from(*total).map_err(|_| {
                WaveCounterError::Configuration(format!(
                    "initial count for '{key}' exceeds SQLite integer range"
                ))
            })?;
        }

        let counter = Self {
            database_path: config.database_path,
            busy_timeout: config.busy_timeout,
        };
        let mut connection = counter.connection()?;
        Self::migrate(&mut connection)?;
        Self::seed_initial_counts(&mut connection, &config.initial_counts)?;
        Ok(counter)
    }

    pub fn get_counter(&self, key: &str) -> Result<CounterSnapshot> {
        validation::counter_key(key)?;
        read_snapshot(&self.connection()?, key)
    }

    pub fn record_event(&self, key: &str, event_id: &str) -> Result<RecordEventResult> {
        self.record_event_at(key, event_id, Utc::now())
    }

    pub fn record_event_at(
        &self,
        key: &str,
        event_id: &str,
        occurred_at: DateTime<Utc>,
    ) -> Result<RecordEventResult> {
        validation::counter_key(key)?;
        validation::event_id(event_id)?;
        let mut connection = self.connection()?;
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let duplicate = transaction
            .query_row(
                "SELECT 1 FROM waves_events WHERE id = ?1",
                [event_id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();

        if duplicate {
            let counter = read_snapshot(&transaction, key)?;
            transaction.commit()?;
            return Ok(RecordEventResult {
                counter,
                created: false,
            });
        }

        let timestamp = occurred_at.timestamp();
        transaction.execute(
            "INSERT OR IGNORE INTO waves_counters
                (key, baseline_count, event_count, created_at, updated_at)
             VALUES (?1, 0, 0, ?2, ?2)",
            params![key, timestamp],
        )?;
        transaction.execute(
            "INSERT INTO waves_events (id, counter_key, occurred_at) VALUES (?1, ?2, ?3)",
            params![event_id, key, timestamp],
        )?;
        transaction.execute(
            "UPDATE waves_counters
             SET event_count = event_count + 1, updated_at = ?2
             WHERE key = ?1",
            params![key, timestamp],
        )?;
        let counter = read_snapshot(&transaction, key)?;
        transaction.commit()?;
        Ok(RecordEventResult {
            counter,
            created: true,
        })
    }

    pub fn analytics(
        &self,
        key: &str,
        window: AnalyticsWindow,
        now: DateTime<Utc>,
    ) -> Result<Analytics> {
        validation::counter_key(key)?;
        let connection = self.connection()?;
        let today = now.date_naive();
        let current_start = today
            .and_hms_opt(0, 0, 0)
            .expect("midnight is valid")
            .and_utc()
            - ChronoDuration::days(6);
        let previous_start = current_start - ChronoDuration::days(7);

        let previous_total = count_events(
            &connection,
            key,
            previous_start.timestamp(),
            current_start.timestamp(),
        )?;
        let mut points = (0..7)
            .map(|offset| AnalyticsPoint {
                start: current_start + ChronoDuration::days(offset),
                count: 0,
            })
            .collect::<Vec<_>>();
        let mut statement = connection.prepare(
            "SELECT CAST((occurred_at - ?2) / 86400 AS INTEGER) AS bucket, COUNT(*)
             FROM waves_events
             WHERE counter_key = ?1 AND occurred_at >= ?2 AND occurred_at <= ?3
             GROUP BY bucket",
        )?;
        let buckets = statement.query_map(
            params![key, current_start.timestamp(), now.timestamp()],
            |row| Ok((row.get::<_, usize>(0)?, row.get::<_, u64>(1)?)),
        )?;
        for bucket in buckets {
            let (index, count) = bucket?;
            if let Some(point) = points.get_mut(index) {
                point.count = count;
            }
        }
        let total = points.iter().map(|point| point.count).sum();
        let change_percentage = (previous_total != 0)
            .then(|| ((total as f64 - previous_total as f64) / previous_total as f64) * 100.0);

        Ok(Analytics {
            key: key.to_owned(),
            window: window.as_str().to_owned(),
            interval: "day".to_owned(),
            timezone: "UTC".to_owned(),
            total,
            previous_total,
            change_percentage,
            points,
        })
    }

    fn connection(&self) -> Result<Connection> {
        let connection = Connection::open_with_flags(
            &self.database_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
        )?;
        connection.busy_timeout(self.busy_timeout)?;
        connection.pragma_update(None, "foreign_keys", true)?;
        let journal_mode: String =
            connection.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
        if journal_mode != "wal" {
            return Err(WaveCounterError::Configuration(format!(
                "SQLite returned journal mode '{journal_mode}' instead of WAL"
            )));
        }
        Ok(connection)
    }

    fn migrate(connection: &mut Connection) -> Result<()> {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute_batch(MIGRATION)?;
        transaction.execute(
            "INSERT OR IGNORE INTO waves_migrations (version, applied_at) VALUES (1, ?1)",
            [Utc::now().timestamp()],
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn seed_initial_counts(
        connection: &mut Connection,
        initial_counts: &HashMap<String, u64>,
    ) -> Result<()> {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let timestamp = Utc::now().timestamp();
        for (key, total) in initial_counts {
            transaction.execute(
                "INSERT OR IGNORE INTO waves_counters
                    (key, baseline_count, event_count, created_at, updated_at)
                 VALUES (?1, ?2, 0, ?3, ?3)",
                params![
                    key,
                    i64::try_from(*total).expect("validated count"),
                    timestamp
                ],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }
}

fn read_snapshot(connection: &Connection, key: &str) -> Result<CounterSnapshot> {
    connection
        .query_row(
            "SELECT baseline_count + event_count, updated_at
             FROM waves_counters WHERE key = ?1",
            [key],
            |row| {
                let total = row.get::<_, u64>(0)?;
                let timestamp = row.get::<_, i64>(1)?;
                Ok(CounterSnapshot {
                    key: key.to_owned(),
                    total,
                    updated_at: Some(
                        Utc.timestamp_opt(timestamp, 0)
                            .single()
                            .expect("SQLite timestamp is representable"),
                    ),
                })
            },
        )
        .optional()?
        .map_or_else(
            || {
                Ok(CounterSnapshot {
                    key: key.to_owned(),
                    total: 0,
                    updated_at: None,
                })
            },
            Ok,
        )
}

fn count_events(connection: &Connection, key: &str, start: i64, end: i64) -> Result<u64> {
    Ok(connection.query_row(
        "SELECT COUNT(*) FROM waves_events
         WHERE counter_key = ?1 AND occurred_at >= ?2 AND occurred_at < ?3",
        params![key, start, end],
        |row| row.get(0),
    )?)
}
