/// YIN pitch detection algorithm.
///
/// Reference: de Cheveigné & Kawahara (2002), "YIN, a fundamental frequency
/// estimator for speech and music", JASA 111(4).
///
/// Input: mono f32 PCM samples at `sample_rate` Hz.
/// Output: fundamental frequency in Hz, or `None` if not detected / low confidence.

const YIN_THRESHOLD: f32 = 0.15;

/// Detect the fundamental frequency of a monophonic signal.
///
/// * `samples`     – slice of f32 PCM samples in the range [-1.0, 1.0]
/// * `sample_rate` – recording sample rate in Hz (e.g. 44100)
///
/// Returns `Some(hz)` when a confident pitch is found, `None` otherwise.
pub fn detect_pitch(samples: &[f32], sample_rate: u32) -> Option<f32> {
    let n = samples.len();
    if n < 2 {
        return None;
    }
    // Maximum lag to check: lowest detectable pitch ~= sample_rate / max_lag.
    // We cap at 20 Hz (infrasound), so max_lag = sample_rate / 20.
    let max_lag = (sample_rate / 20).min(n as u32 / 2) as usize;
    // Minimum lag for ~1200 Hz upper bound.
    let min_lag = (sample_rate / 1200).max(2) as usize;

    if max_lag <= min_lag {
        return None;
    }

    // Step 1 & 2: difference function d(τ)
    let mut diff = vec![0.0f32; max_lag + 1];
    for tau in 1..=max_lag {
        let mut sum = 0.0f32;
        for j in 0..(n - tau) {
            let delta = samples[j] - samples[j + tau];
            sum += delta * delta;
        }
        diff[tau] = sum;
    }

    // Step 3: cumulative mean normalised difference function (CMNDF)
    let mut cmndf = vec![0.0f32; max_lag + 1];
    cmndf[0] = 1.0;
    let mut running_sum = 0.0f32;
    for tau in 1..=max_lag {
        running_sum += diff[tau];
        if running_sum.abs() < f32::EPSILON {
            cmndf[tau] = 1.0;
        } else {
            cmndf[tau] = diff[tau] * tau as f32 / running_sum;
        }
    }

    // Step 4: absolute threshold — find first local minimum below threshold.
    let mut tau_opt: Option<usize> = None;
    let mut tau = min_lag;
    while tau <= max_lag {
        if cmndf[tau] < YIN_THRESHOLD {
            // Find the local minimum within this dip.
            while tau + 1 <= max_lag && cmndf[tau + 1] < cmndf[tau] {
                tau += 1;
            }
            tau_opt = Some(tau);
            break;
        }
        tau += 1;
    }

    // Fallback: pick global minimum if nothing below threshold.
    let tau_opt = tau_opt.unwrap_or_else(|| {
        (min_lag..=max_lag)
            .min_by(|&a, &b| cmndf[a].partial_cmp(&cmndf[b]).unwrap())
            .unwrap_or(min_lag)
    });

    if cmndf[tau_opt] > 0.5 {
        // Very low confidence — bail out.
        return None;
    }

    // Step 5: parabolic interpolation for sub-sample accuracy.
    let tau_f = parabolic_interpolation(&cmndf, tau_opt);

    if tau_f <= 0.0 {
        return None;
    }

    Some(sample_rate as f32 / tau_f)
}

/// Parabolic interpolation around the minimum at index `tau`.
fn parabolic_interpolation(cmndf: &[f32], tau: usize) -> f32 {
    if tau == 0 || tau >= cmndf.len() - 1 {
        return tau as f32;
    }
    let y0 = cmndf[tau - 1];
    let y1 = cmndf[tau];
    let y2 = cmndf[tau + 1];
    let denom = 2.0 * (2.0 * y1 - y2 - y0);
    if denom.abs() < f32::EPSILON {
        return tau as f32;
    }
    tau as f32 + (y2 - y0) / denom
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    fn sine_wave(freq: f32, sample_rate: u32, num_samples: usize) -> Vec<f32> {
        (0..num_samples)
            .map(|i| (2.0 * PI * freq * i as f32 / sample_rate as f32).sin())
            .collect()
    }

    #[test]
    fn test_detect_a4() {
        let samples = sine_wave(440.0, 44100, 4096);
        let hz = detect_pitch(&samples, 44100).expect("Should detect A4");
        assert!(
            (hz - 440.0).abs() < 5.0,
            "Expected ~440 Hz, got {hz:.1} Hz"
        );
    }

    #[test]
    fn test_detect_c4() {
        let samples = sine_wave(261.63, 44100, 4096);
        let hz = detect_pitch(&samples, 44100).expect("Should detect C4");
        assert!((hz - 261.63).abs() < 5.0, "Expected ~261.6 Hz, got {hz:.1} Hz");
    }

    #[test]
    fn test_silence_returns_none() {
        let samples = vec![0.0f32; 4096];
        assert!(detect_pitch(&samples, 44100).is_none());
    }
}
