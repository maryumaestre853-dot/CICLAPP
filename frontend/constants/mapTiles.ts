/**
 * Mapa de respaldo para Android.
 *
 * En Expo Go SDK 57 el mapa base de Google sale NEGRO en Android: el SDK de Google
 * rechaza la clave de Expo Go ("Authorization failure", expo/expo#49323). No es un
 * error de tu código ni de tu clave.
 *
 * En Android se usan tiles públicos de OpenStreetMap para no depender de que
 * Google Maps autorice la clave nativa del entorno de prueba. Para usar Google
 * Maps en una build propia, define EXPO_PUBLIC_MAP_TILES=google.
 *
 * Para cambiar de proveedor de tiles: EXPO_PUBLIC_MAP_TILES_URL en frontend/.env
 * Para usar el mapa de Google: EXPO_PUBLIC_MAP_TILES=google
 */
import { Platform } from "react-native";

export const USAR_TILES_RESPALDO =
  Platform.OS === "android" &&
  process.env.EXPO_PUBLIC_MAP_TILES !== "google";

export const TILES_URL =
  process.env.EXPO_PUBLIC_MAP_TILES_URL ||
  "https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png";

export const TILES_ATRIBUCION = "© OpenStreetMap contributors";
