import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface PrintConfig {
  paperWidth: '80mm' | '58mm';
  storeTitle: string;
  legalEntityName: string;
  gstin: string;
  panNumber: string;
  showGstin: boolean;
  showAddress: boolean;
  showPhone: boolean;
  customFooterNote: string;
  copiesCount: 1 | 2;
  showStamp: boolean;
  showDoubleEntry: boolean;
  showQrVerification: boolean;
  autoPrintOnSave: boolean;
}

interface PrintConfigState {
  config: PrintConfig;
  fetchCloudPrintConfig: () => Promise<void>;
  updateConfig: (updates: Partial<PrintConfig>) => Promise<void>;
  resetConfig: () => Promise<void>;
}

const STORAGE_KEY = 'asopalav_thermal_print_config_v1';

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  paperWidth: '80mm',
  storeTitle: 'Asopalav Silk & Sarees',
  legalEntityName: 'Asopalav Endeavours LLP',
  gstin: '24ABVFA8046N1ZQ',
  panNumber: 'ABVFA8046N',
  showGstin: true,
  showAddress: true,
  showPhone: true,
  customFooterNote: 'Thank You • Computer Generated Cash Voucher • Authorized Signatory',
  copiesCount: 1,
  showStamp: true,
  showDoubleEntry: true,
  showQrVerification: true,
  autoPrintOnSave: false,
};

const getStoredPrintConfig = (): PrintConfig => {
  if (typeof window === 'undefined') return DEFAULT_PRINT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_PRINT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to parse print config:', e);
  }
  return DEFAULT_PRINT_CONFIG;
};

export const usePrintConfigStore = create<PrintConfigState>((set, get) => ({
  config: getStoredPrintConfig(),

  fetchCloudPrintConfig: async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'thermal_print_config')
        .maybeSingle();

      if (!error && data?.setting_value) {
        const merged = { ...DEFAULT_PRINT_CONFIG, ...data.setting_value };
        set({ config: merged });
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      }
    } catch (e) {
      console.warn('Thermal print config cloud fetch fallback:', e);
    }
  },

  updateConfig: async (updates: Partial<PrintConfig>) => {
    const updated = { ...get().config, ...updates };
    set({ config: updated });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('asopalav:print-config-updated', { detail: updated }));
      } catch (e) {
        console.warn('Failed to persist print config:', e);
      }
    }

    // Persist to Supabase app_settings
    try {
      await supabase.from('app_settings').upsert({
        setting_key: 'thermal_print_config',
        setting_value: updated,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Thermal print config cloud save fallback:', e);
    }
  },

  resetConfig: async () => {
    set({ config: DEFAULT_PRINT_CONFIG });
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('asopalav:print-config-updated', { detail: DEFAULT_PRINT_CONFIG }));
      } catch (e) {
        console.warn('Failed to reset print config:', e);
      }
    }

    try {
      await supabase.from('app_settings').upsert({
        setting_key: 'thermal_print_config',
        setting_value: DEFAULT_PRINT_CONFIG,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Thermal print config cloud reset fallback:', e);
    }
  },
}));
