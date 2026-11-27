import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Desde React Native 0.85 `useColorScheme()` también puede devolver 'unspecified'.
 * Lo normalizamos a 'light' | 'dark' para poder indexar Colors[...] sin errores de tipos.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
