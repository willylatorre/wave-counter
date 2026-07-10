use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Duration};

use napi::{
    Env, Status,
    bindgen_prelude::{AsyncTask, Task},
};
use napi_derive::napi;
use wave_counter_core::{AnalyticsWindow, Config, WaveCounter, WaveCounterError};

#[napi]
pub struct NativeWaveCounter {
    inner: Arc<WaveCounter>,
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
        let inner = WaveCounter::open(config).map_err(domain_error)?;
        Ok(Self {
            inner: Arc::new(inner),
        })
    }

    #[napi(js_name = "getCounter")]
    pub fn get_counter(&self, key: String) -> AsyncTask<GetCounterTask> {
        AsyncTask::new(GetCounterTask {
            inner: Arc::clone(&self.inner),
            key,
        })
    }

    #[napi(js_name = "recordEvent")]
    pub fn record_event(&self, key: String, event_id: String) -> AsyncTask<RecordEventTask> {
        AsyncTask::new(RecordEventTask {
            inner: Arc::clone(&self.inner),
            key,
            event_id,
        })
    }

    #[napi]
    pub fn analytics(&self, key: String, window: String) -> AsyncTask<AnalyticsTask> {
        AsyncTask::new(AnalyticsTask {
            inner: Arc::clone(&self.inner),
            key,
            window,
        })
    }
}

pub struct GetCounterTask {
    inner: Arc<WaveCounter>,
    key: String,
}

impl Task for GetCounterTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let snapshot = self.inner.get_counter(&self.key).map_err(domain_error)?;
        serde_json::to_string(&snapshot).map_err(serialization_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct RecordEventTask {
    inner: Arc<WaveCounter>,
    key: String,
    event_id: String,
}

impl Task for RecordEventTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let result = self
            .inner
            .record_event(&self.key, &self.event_id)
            .map_err(domain_error)?;
        serde_json::to_string(&result).map_err(serialization_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct AnalyticsTask {
    inner: Arc<WaveCounter>,
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
            .inner
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
