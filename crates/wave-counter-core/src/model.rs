use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalyticsWindow {
    SevenDays,
}

impl AnalyticsWindow {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SevenDays => "7d",
        }
    }
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
    pub window: String,
    pub interval: String,
    pub timezone: String,
    pub total: u64,
    pub previous_total: u64,
    pub change_percentage: Option<f64>,
    pub points: Vec<AnalyticsPoint>,
}
