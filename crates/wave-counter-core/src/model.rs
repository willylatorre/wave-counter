use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::WaveCounterError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterSnapshot {
    pub key: String,
    pub total: u64,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordEventResult {
    pub counter: CounterSnapshot,
    pub created: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnalyticsWindow {
    #[serde(rename = "7d")]
    SevenDays,
}

impl AnalyticsWindow {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SevenDays => "7d",
        }
    }
}

impl std::str::FromStr for AnalyticsWindow {
    type Err = WaveCounterError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "7d" => Ok(Self::SevenDays),
            _ => Err(WaveCounterError::InvalidAnalyticsWindow),
        }
    }
}

/// Bucketing granularity of an analytics response. V1 always reports daily
/// buckets; the enum keeps the wire value typed so future intervals cannot be
/// introduced as bare strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnalyticsInterval {
    #[serde(rename = "day")]
    Day,
}

/// Timezone the analytics buckets are computed in. V1 always uses UTC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnalyticsTimezone {
    #[serde(rename = "UTC")]
    Utc,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsPoint {
    pub start: DateTime<Utc>,
    pub count: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analytics {
    pub key: String,
    pub window: AnalyticsWindow,
    pub interval: AnalyticsInterval,
    pub timezone: AnalyticsTimezone,
    pub total: u64,
    pub previous_total: u64,
    pub change_percentage: Option<f64>,
    pub points: Vec<AnalyticsPoint>,
}
