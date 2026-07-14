use rusqlite::{Error as SqliteError, ErrorCode as SqliteErrorCode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidCounterKey,
    InvalidEventId,
    InvalidAnalyticsWindow,
    Busy,
    Configuration,
    Storage,
}

impl ErrorCode {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidCounterKey => "invalid_counter_key",
            Self::InvalidEventId => "invalid_event_id",
            Self::InvalidAnalyticsWindow => "invalid_analytics_window",
            Self::Busy => "busy",
            Self::Configuration => "configuration",
            Self::Storage => "storage",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum WaveCounterError {
    #[error("counter key must match [a-z0-9][a-z0-9_-]{{0,63}}")]
    InvalidCounterKey,
    #[error("event ID must be a UUIDv7")]
    InvalidEventId,
    #[error("analytics window is not supported")]
    InvalidAnalyticsWindow,
    #[error("database remained busy after the configured timeout")]
    Busy,
    #[error("invalid database configuration: {0}")]
    Configuration(String),
    #[error("storage operation failed")]
    Storage(#[source] SqliteError),
    #[error("stored data could not be interpreted")]
    CorruptData(String),
}

impl WaveCounterError {
    #[must_use]
    pub const fn code(&self) -> ErrorCode {
        match self {
            Self::InvalidCounterKey => ErrorCode::InvalidCounterKey,
            Self::InvalidEventId => ErrorCode::InvalidEventId,
            Self::InvalidAnalyticsWindow => ErrorCode::InvalidAnalyticsWindow,
            Self::Busy => ErrorCode::Busy,
            Self::Configuration(_) => ErrorCode::Configuration,
            Self::Storage(_) | Self::CorruptData(_) => ErrorCode::Storage,
        }
    }

    /// Encodes the error as the `code|message` string shared across the native
    /// bindings. Keeping the wire format here means Python and Node decode a
    /// single, canonical representation.
    #[must_use]
    pub fn wire(&self) -> String {
        format!("{}|{self}", self.code().as_str())
    }
}

impl From<SqliteError> for WaveCounterError {
    fn from(error: SqliteError) -> Self {
        match &error {
            SqliteError::SqliteFailure(details, _)
                if matches!(
                    details.code,
                    SqliteErrorCode::DatabaseBusy | SqliteErrorCode::DatabaseLocked
                ) =>
            {
                Self::Busy
            }
            _ => Self::Storage(error),
        }
    }
}

pub type Result<T> = std::result::Result<T, WaveCounterError>;
