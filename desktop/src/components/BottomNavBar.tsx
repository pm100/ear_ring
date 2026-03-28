import React from 'react';
import { Screen } from '../types';

interface Tab {
  screen: Screen;
  icon: string;
  label: string;
}

const TABS: Tab[] = [
  { screen: 'home',     icon: '🏠', label: 'Home' },
  { screen: 'setup',    icon: '🎙', label: 'Mic' },
  { screen: 'progress', icon: '📊', label: 'Progress' },
  { screen: 'settings', icon: '⚙️', label: 'Settings' },
  { screen: 'help',     icon: '❓', label: 'Help' },
];

interface Props {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

export default function BottomNavBar({ currentScreen, onNavigate }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.map(tab => (
        <button
          key={tab.screen}
          className={`bottom-nav-item${currentScreen === tab.screen ? ' bottom-nav-item--active' : ''}`}
          onClick={() => onNavigate(tab.screen)}
          type="button"
        >
          <span className="bottom-nav-icon">{tab.icon}</span>
          <span className="bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
