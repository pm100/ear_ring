// We use ScriptProcessorNode instead of AudioWorklet for broader compatibility
// This file is kept for future AudioWorklet migration
export const WORKLET_CODE = `
class PitchProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      this.port.postMessage({ samples: Array.from(input[0]) });
    }
    return true;
  }
}
registerProcessor('pitch-processor', PitchProcessor);
`;
