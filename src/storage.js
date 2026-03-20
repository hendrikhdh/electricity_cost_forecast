// ============================================================
// storage.js — localStorage adapter for GitHub Pages PWA
// Same interface as window.storage but uses localStorage
// All data stays on the device.
// ============================================================

const PREFIX = "stromapp:";

const sto = {
  async get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw != null ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("Storage write failed:", e);
      return false;
    }
  },

  async remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      return true;
    } catch {
      return false;
    }
  },
};

export const SK = {
  READINGS: "readings",
  PERSONS: "persons",
  CALENDAR: "calendar",
  CONTRACT: "contract",
  PAYMENTS: "payments",
  MODEL_PARAMS: "modelParams",
  CALIBRATION_LOG: "calibrationLog",
  SETTINGS: "settings",
  STANDARD_WEEKS: "standardWeeks",
};

export default sto;
