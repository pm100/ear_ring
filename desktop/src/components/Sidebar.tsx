import React from 'react';
import { Screen } from '../types';

interface Tab {
  screen: Screen;
  icon: string;
  label: string;
}

// Mirrors the iPad sidebar's tab list (see ios/earring/ContentView.swift tabItems).
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

export default function Sidebar({ currentScreen, onNavigate }: Props) {
  return (
    <nav className="sidebar">
      <div className="sidebar-title">Ear Ring</div>
      {TABS.map(tab => (
        <button
          key={tab.screen}
          className={`sidebar-item${currentScreen === tab.screen ? ' sidebar-item--active' : ''}`}
          onClick={() => onNavigate(tab.screen)}
          type="button"
        >
          <span className="sidebar-icon">{tab.icon}</span>
          <span className="sidebar-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
