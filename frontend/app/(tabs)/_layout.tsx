/**
 * CICLAPP — Menú inferior
 * app/(tabs)/_layout.tsx
 *
 * Inicio · Mis bicicletas · Rutas · Perfil
 */

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";

const VERDE = "#27AE60";
const GRIS = "#6B7280";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: VERDE,
        tabBarInactiveTintColor: GRIS,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          height: Platform.OS === "ios" ? 88 : 66,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
          elevation: 12,
          shadowColor: "#0F2A43",
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -3 },
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mis-bicicletas"
        options={{
          title: "Mis bicicletas",
          tabBarIcon: ({ color }) => <Ionicons name="bicycle" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="rutas"
        options={{
          title: "Rutas",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "map" : "map-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cuenta"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
        }}
      />
      {/* Plantilla de Expo que no se usa: se oculta del menú */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
