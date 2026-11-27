import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { estaLogueado } from "../services/storage";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let canceled = false;
    (async () => {
      const logged = await estaLogueado();
      if (!canceled) {
        setIsLoggedIn(logged);
        setAuthReady(true);
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;

    let canceled = false;
    (async () => {
      const logged = await estaLogueado();
      if (!canceled) {
        setIsLoggedIn(logged);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!authReady) return;

    if (!isLoggedIn && pathname !== '/login') {
      router.replace('/login');
      return;
    }

    if (isLoggedIn && (pathname === '/' || pathname === '/index' || pathname === '/login')) {
      router.replace('/(tabs)');
    }
  }, [authReady, isLoggedIn, pathname, router]);

  if (!authReady) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
