import { View, ActivityIndicator } from "react-native";

// Esta pantalla existe solo para que la ruta "/" tenga un archivo real
// que Expo Router pueda emparejar. La redirección de verdad (a /login
// o a /(tabs) según haya sesión) ya la maneja app/_layout.tsx en su
// useEffect que escucha el pathname. Aquí solo mostramos un loader
// mientras eso ocurre.
export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
