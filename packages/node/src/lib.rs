use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use napi::{
    Env, Status,
    bindgen_prelude::{AsyncTask, Task},
};
use napi_derive::napi;
use wave_counter_core::{AnalyticsWindow, Config, WaveCounter, WaveCounterError};

#[napi]
pub struct NativeWaveCounter {
    engine: Mutex<Option<Arc<WaveCounter>>>,
}

#[napi]
impl NativeWaveCounter {
    #[napi(constructor)]
    pub fn new(
        database_path: Option<String>,
        initial_counts_json: Option<String>,
        busy_timeout_ms: Option<u32>,
    ) -> napi::Result<Self> {
        let mut config = database_path
            .map(PathBuf::from)
            .map_or_else(Config::default, Config::new)
            .with_busy_timeout(Duration::from_millis(u64::from(
                busy_timeout_ms.unwrap_or(5_000),
            )));
        if let Some(encoded) = initial_counts_json {
            let initial_counts: HashMap<String, u64> = serde_json::from_str(&encoded)
                .map_err(|error| napi::Error::new(Status::InvalidArg, error.to_string()))?;
            config = config.with_initial_counts(initial_counts);
        }
        // Open eagerly so configuration, WAL, and baseline failures surface at
        // construction, matching the Python binding and the spec's
        // "initialization fails with a configuration error" contract.
        let engine = Arc::new(WaveCounter::open(config).map_err(domain_error)?);
        Ok(Self {
            engine: Mutex::new(Some(engine)),
        })
    }

    #[napi(js_name = "getCounter")]
    pub fn get_counter(&self, key: String) -> napi::Result<AsyncTask<GetCounterTask>> {
        Ok(AsyncTask::new(GetCounterTask {
            engine: self.engine()?,
            key,
        }))
    }

    #[napi(js_name = "recordEvent")]
    pub fn record_event(
        &self,
        key: String,
        event_id: String,
    ) -> napi::Result<AsyncTask<RecordEventTask>> {
        Ok(AsyncTask::new(RecordEventTask {
            engine: self.engine()?,
            key,
            event_id,
        }))
    }

    #[napi]
    pub fn analytics(&self, key: String, window: String) -> napi::Result<AsyncTask<AnalyticsTask>> {
        Ok(AsyncTask::new(AnalyticsTask {
            engine: self.engine()?,
            key,
            window,
        }))
    }

    #[napi]
    pub fn close(&self) {
        let _ = self
            .engine
            .lock()
            .expect("native engine mutex poisoned")
            .take();
    }
}

impl NativeWaveCounter {
    fn engine(&self) -> napi::Result<Arc<WaveCounter>> {
        self.engine
            .lock()
            .expect("native engine mutex poisoned")
            .as_ref()
            .cloned()
            .ok_or_else(closed_error)
    }
}

pub struct GetCounterTask {
    engine: Arc<WaveCounter>,
    key: String,
}

impl Task for GetCounterTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let snapshot = self.engine.get_counter(&self.key).map_err(domain_error)?;
        serde_json::to_string(&snapshot).map_err(serialization_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct RecordEventTask {
    engine: Arc<WaveCounter>,
    key: String,
    event_id: String,
}

impl Task for RecordEventTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let result = self
            .engine
            .record_event(&self.key, &self.event_id)
            .map_err(domain_error)?;
        serde_json::to_string(&result).map_err(serialization_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct AnalyticsTask {
    engine: Arc<WaveCounter>,
    key: String,
    window: String,
}

impl Task for AnalyticsTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let window = self
            .window
            .parse::<AnalyticsWindow>()
            .map_err(domain_error)?;
        let analytics = self
            .engine
            .analytics(&self.key, window, chrono::Utc::now())
            .map_err(domain_error)?;
        serde_json::to_string(&analytics).map_err(serialization_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

fn domain_error(error: WaveCounterError) -> napi::Error {
    napi::Error::new(Status::GenericFailure, error.wire())
}

fn serialization_error(error: serde_json::Error) -> napi::Error {
    napi::Error::new(
        Status::GenericFailure,
        format!("storage|response serialization failed: {error}"),
    )
}

fn closed_error() -> napi::Error {
    napi::Error::new(
        Status::GenericFailure,
        "storage|counter storage is closed".to_string(),
    )
}
