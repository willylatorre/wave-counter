use uuid::{Uuid, Version};

use crate::error::{Result, WaveCounterError};

pub(crate) fn counter_key(key: &str) -> Result<()> {
    let bytes = key.as_bytes();
    let valid_first = bytes.first().is_some_and(u8::is_ascii_lowercase)
        || bytes.first().is_some_and(u8::is_ascii_digit);
    let valid_rest = bytes.iter().all(|byte| {
        byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'_' | b'-')
    });

    if bytes.len() <= 64 && valid_first && valid_rest {
        Ok(())
    } else {
        Err(WaveCounterError::InvalidCounterKey)
    }
}

pub(crate) fn event_id(id: &str) -> Result<()> {
    let uuid = Uuid::parse_str(id).map_err(|_| WaveCounterError::InvalidEventId)?;
    if uuid.get_version() == Some(Version::SortRand) {
        Ok(())
    } else {
        Err(WaveCounterError::InvalidEventId)
    }
}
