use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Duration};

use pyo3::{exceptions::PyRuntimeError, prelude::*};
use wave_counter_core::{AnalyticsWindow, Config, WaveCounter, WaveCounterError};

#[pyclass(name = "NativeWaveCounter")]
struct NativeWaveCounter {
    inner: Arc<WaveCounter>,
}

#[pymethods]
impl NativeWaveCounter {
    #[new]
    #[pyo3(signature = (database_path=None, initial_counts=None, busy_timeout_ms=5000))]
    fn new(
        py: Python<'_>,
        database_path: Option<PathBuf>,
        initial_counts: Option<HashMap<String, u64>>,
        busy_timeout_ms: u64,
    ) -> PyResult<Self> {
        let mut config = database_path.map_or_else(Config::default, Config::new);
        config = config.with_busy_timeout(Duration::from_millis(busy_timeout_ms));
        if let Some(initial_counts) = initial_counts {
            config = config.with_initial_counts(initial_counts);
        }
        let inner = py
            .detach(|| WaveCounter::open(config))
            .map_err(domain_error)?;
        Ok(Self {
            inner: Arc::new(inner),
        })
    }

    fn get_counter(&self, py: Python<'_>, key: String) -> PyResult<String> {
        let inner = Arc::clone(&self.inner);
        let snapshot = py
            .detach(move || inner.get_counter(&key))
            .map_err(domain_error)?;
        serde_json::to_string(&snapshot).map_err(serialization_error)
    }

    fn record_event(&self, py: Python<'_>, key: String, event_id: String) -> PyResult<String> {
        let inner = Arc::clone(&self.inner);
        let result = py
            .detach(move || inner.record_event(&key, &event_id))
            .map_err(domain_error)?;
        serde_json::to_string(&result).map_err(serialization_error)
    }

    #[pyo3(signature = (key, window="7d".to_owned()))]
    fn analytics(&self, py: Python<'_>, key: String, window: String) -> PyResult<String> {
        let inner = Arc::clone(&self.inner);
        let analytics = py
            .detach(move || {
                let window = window.parse::<AnalyticsWindow>()?;
                inner.analytics(&key, window, chrono::Utc::now())
            })
            .map_err(domain_error)?;
        serde_json::to_string(&analytics).map_err(serialization_error)
    }
}

fn domain_error(error: WaveCounterError) -> PyErr {
    PyRuntimeError::new_err(error.wire())
}

fn serialization_error(error: serde_json::Error) -> PyErr {
    PyRuntimeError::new_err(format!("storage|response serialization failed: {error}"))
}

#[pymodule]
fn _native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<NativeWaveCounter>()?;
    Ok(())
}
