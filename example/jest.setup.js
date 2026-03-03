/* global jest */
import '@testing-library/jest-native/extend-expect';

// Mock expo modules
jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Global test timeout
jest.setTimeout(10000);
