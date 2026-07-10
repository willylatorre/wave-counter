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
    engine: LazyEngine,
}

#[derive(Clone)]
struct LazyEngine {
    config: Arc<Config>,
    initialized: Arc<Mutex<Option<Arc<WaveCounter>>>>,
}

impl LazyEngine {
    fn new(config: Config) -> Self {
        Self {
            config: Arc::new(config),
            initialized: Arc::new(Mutex::new(None)),
        }
    }

    fn get(&self) -> napi::Result<Arc<WaveCounter>> {
        let mut initialized = self.initialized.lock().map_err(|_| {
            napi::Error::new(Status::GenericFailure, "storage|initialization lock failed")
        })?;
        if let Some(engine) = initialized.as_ref() {
            return Ok(Arc::clone(engine));
        }
        let engine = Arc::new(WaveCounter::open((*self.config).clone()).map_err(domain_error)?);
        *initialized = Some(Arc::clone(&engine));
        Ok(engine)
    }
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
        Ok(Self {
            engine: LazyEngine::new(config),
        })
    }

    #[napi(js_name = "getCounter")]
    pub fn get_counter(&self, key: String) -> AsyncTask<GetCounterTask> {
        AsyncTask::new(GetCounterTask {
            engine: self.engine.clone(),
            key,
        })
    }

    #[napi(js_name = "recordEvent")]
    pub fn record_event(&self, key: String, event_id: String) -> AsyncTask<RecordEventTask> {
        AsyncTask::new(RecordEventTask {
            engine: self.engine.clone(),
            key,
            event_id,
        })
    }

    #[napi]
    pub fn analytics(&self, key: String, window: String) -> AsyncTask<AnalyticsTask> {
        AsyncTask::new(AnalyticsTask {
            engine: self.engine.clone(),
            key,
            window,
        })
    }
}

pub struct GetCounterTask {
    engine: LazyEngine,
    key: String,
}

impl Task for GetCounterTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let snapshot = self
            .engine
            .get()?
            .get_counter(&self.key)
            .map_err(domain_error)?;
        serde_json::to_string(&snapshot).map_err(serialization_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct RecordEventTask {
    engine: LazyEngine,
    key: String,
    event_id: String,
}

impl Task for RecordEventTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let result = self
            .engine
            .get()?
            .record_event(&self.key, &self.event_id)
            .map_err(domain_error)?;
        serde_json::to_string(&result).map_err(serialization_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct AnalyticsTask {
    engine: LazyEngine,
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
            .get()?
            .analytics(&self.key, window, chrono::Utc::now())
            .map_err(domain_error)?;
        serde_json::to_string(&analytics).map_err(serialization_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

fn domain_error(error: WaveCounterError) -> napi::Error {
    napi::Error::new(
        Status::GenericFailure,
        format!("{}|{error}", error.code().as_str()),
    )
}

fn serialization_error(error: serde_json::Error) -> napi::Error {
    napi::Error::new(
        Status::GenericFailure,
        format!("storage|response serialization failed: {error}"),
    )
}
