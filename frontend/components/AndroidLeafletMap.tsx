import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { LatLng, Region } from "react-native-maps";

export type AndroidMapMarker = {
  coordinate: LatLng;
  color: string;
  title?: string;
};

export type AndroidMapPolyline = {
  coordinates: LatLng[];
  color: string;
  width: number;
  dashPattern?: number[];
};

export type AndroidLeafletMapHandle = {
  animateToRegion: (region: Region, duration?: number) => void;
  fitToCoordinates: (
    coordinates: LatLng[],
    options?: {
      edgePadding?: { top: number; right: number; bottom: number; left: number };
      animated?: boolean;
    }
  ) => void;
};

type Props = {
  initialRegion: Region;
  markers?: AndroidMapMarker[];
  polylines?: AndroidMapPolyline[];
  onPress?: (coordinate: LatLng) => void;
  style?: object;
};

const TILE_URL =
  process.env.EXPO_PUBLIC_MAP_TILES_URL ||
  "https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png";

function zoomForDelta(delta: number): number {
  return Math.max(3, Math.min(19, Math.round(Math.log2(360 / delta))));
}

const AndroidLeafletMap = forwardRef<AndroidLeafletMapHandle, Props>(
  function AndroidLeafletMap(
    { initialRegion, markers = [], polylines = [], onPress, style },
    ref
  ) {
    const webViewRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const queuedScripts = useRef<string[]>([]);
    const [loadError, setLoadError] = useState(false);

    const html = useMemo(
      () => `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #e8e6df; }
    .leaflet-control-attribution { font-size: 10px !important; }
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    const tileUrl = ${JSON.stringify(TILE_URL)};
    const map = L.map('map', { zoomControl: false }).setView(
      [${initialRegion.latitude}, ${initialRegion.longitude}],
      ${zoomForDelta(initialRegion.latitudeDelta)}
    );
    L.tileLayer(tileUrl, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const overlays = L.layerGroup().addTo(map);
    window.ciclappSetData = function(serialized) {
      const data = JSON.parse(serialized);
      overlays.clearLayers();
      (data.polylines || []).forEach(function(line) {
        if (line.coordinates.length > 1) {
          L.polyline(line.coordinates.map(function(p) { return [p.latitude, p.longitude]; }), {
            color: line.color, weight: line.width, dashArray: line.dashPattern ? line.dashPattern.join(',') : null
          }).addTo(overlays);
        }
      });
      (data.markers || []).forEach(function(marker) {
        L.circleMarker([marker.coordinate.latitude, marker.coordinate.longitude], {
          radius: marker.title === 'Tu ubicación' ? 8 : 10,
          color: '#ffffff', weight: 3, fillColor: marker.color, fillOpacity: 1
        }).addTo(overlays);
      });
    };
    window.ciclappCommand = function(serialized) {
      const command = JSON.parse(serialized);
      if (command.type === 'center') {
        map.setView([command.region.latitude, command.region.longitude], command.zoom, { animate: true });
      } else if (command.type === 'fit' && command.coordinates.length) {
        const bounds = L.latLngBounds(command.coordinates.map(function(p) { return [p.latitude, p.longitude]; }));
        map.fitBounds(bounds, {
          paddingTopLeft: command.paddingTopLeft,
          paddingBottomRight: command.paddingBottomRight,
          maxZoom: 16,
          animate: command.animated
        });
      }
    };
    map.on('click', function(event) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'press',
        coordinate: { latitude: event.latlng.lat, longitude: event.latlng.lng }
      }));
    });
    setTimeout(function() {
      map.invalidateSize();
      window.ReactNativeWebView.postMessage('ready');
    }, 300);
  </script>
</body>
</html>`,
      [initialRegion.latitude, initialRegion.longitude, initialRegion.latitudeDelta]
    );

    const inject = useCallback((script: string) => {
      if (readyRef.current) {
        webViewRef.current?.injectJavaScript(script);
      } else {
        queuedScripts.current.push(script);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        animateToRegion: (region, duration = 800) => {
          inject(
            `window.ciclappCommand(${JSON.stringify(
              JSON.stringify({
                type: "center",
                region,
                zoom: zoomForDelta(region.latitudeDelta),
                duration,
              })
            )}); true;`
          );
        },
        fitToCoordinates: (coordinates, options = {}) => {
          const padding = options.edgePadding ?? { top: 40, right: 40, bottom: 40, left: 40 };
          inject(
            `window.ciclappCommand(${JSON.stringify(
              JSON.stringify({
                type: "fit",
                coordinates,
                paddingTopLeft: [padding.left, padding.top],
                paddingBottomRight: [padding.right, padding.bottom],
                animated: options.animated ?? true,
              })
            )}); true;`
          );
        },
      }),
      [inject]
    );

    useEffect(() => {
      inject(
        `window.ciclappSetData(${JSON.stringify(
          JSON.stringify({ markers, polylines })
        )}); true;`
      );
    }, [inject, markers, polylines]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        if (event.nativeEvent.data === "ready") {
          readyRef.current = true;
          setLoadError(false);
          queuedScripts.current.splice(0).forEach((script) => {
            webViewRef.current?.injectJavaScript(script);
          });
          return;
        }

        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === "press") onPress?.(message.coordinate);
        } catch (error) {
          console.error("No se pudo interpretar el evento del mapa:", error);
        }
      },
      [onPress]
    );

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          source={{ html, baseUrl: "https://unpkg.com" }}
          originWhitelist={["https://*", "http://*", "file://*"]}
          javaScriptEnabled
          domStorageEnabled
          onMessage={handleMessage}
          onError={() => setLoadError(true)}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 400) setLoadError(true);
          }}
          style={styles.webView}
        />
        {loadError && (
          <View pointerEvents="none" style={styles.error}>
            <Text style={styles.errorText}>
              No se pudo cargar el mapa. Comprueba la conexión a Internet.
            </Text>
          </View>
        )}
      </View>
    );
  }
);

AndroidLeafletMap.displayName = "AndroidLeafletMap";

export default AndroidLeafletMap;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e8e6df" },
  webView: { flex: 1, backgroundColor: "transparent" },
  error: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 24,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  errorText: { color: "#1a1a2e", textAlign: "center" },
});
