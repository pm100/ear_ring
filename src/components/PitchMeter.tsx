import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { NOTE_NAMES } from '../utils/musicTheory';

interface PitchMeterProps {
  hz: number;
  midi: number;
  cents: number;
}

function midiLabel(midi: number): string {
  if (midi < 0) return '—';
  const chroma = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[chroma]}${octave}`;
}

/** A simple circular indicator showing the currently detected note. */
export default function PitchMeter({ hz, midi }: PitchMeterProps) {
  const inTune = true; // cents removed — just show green when active
  const color = hz > 0 ? '#4ade80' : '#475569';

  return (
    <View style={styles.container}>
      <Svg width={80} height={80}>
        <Circle cx={40} cy={40} r={36} fill={color} opacity={0.2} />
        <Circle cx={40} cy={40} r={36} fill="none" stroke={color} strokeWidth={2} />
        <SvgText
          x={40}
          y={46}
          textAnchor="middle"
          fontSize={22}
          fontWeight="bold"
          fill={color}
        >
          {midiLabel(midi)}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});
