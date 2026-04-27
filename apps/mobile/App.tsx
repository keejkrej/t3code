import * as ScreenOrientation from "expo-screen-orientation";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

import { createInjectedMobileBridgeScript, handleMobileBridgeMessage } from "./src/mobileBridge";
import { prepareBundledWebUi } from "./src/webBundle";

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [webUri, setWebUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const injectedBridgeScript = useMemo(() => createInjectedMobileBridgeScript(), []);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(
      () => undefined,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void prepareBundledWebUi()
      .then((uri) => {
        if (!cancelled) {
          setWebUri(uri);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    void handleMobileBridgeMessage(webViewRef.current, event.nativeEvent.data);
  };

  if (loadError) {
    return createElement(
      View,
      { style: styles.centered },
      createElement(Text, { style: styles.errorTitle }, "Unable to load T3 Code"),
      createElement(Text, { style: styles.errorText }, loadError),
    );
  }

  if (!webUri) {
    return createElement(View, { style: styles.centered }, createElement(ActivityIndicator));
  }

  return createElement(
    View,
    { style: styles.root },
    createElement(WebView, {
      ref: webViewRef,
      source: { uri: webUri },
      style: styles.webView,
      originWhitelist: ["*"],
      javaScriptEnabled: true,
      domStorageEnabled: true,
      allowsBackForwardNavigationGestures: true,
      injectedJavaScriptBeforeContentLoaded: injectedBridgeScript,
      onMessage: handleMessage,
    }),
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  webView: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: "#09090b",
  },
  errorTitle: {
    color: "#fafafa",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  errorText: {
    color: "#a1a1aa",
    fontSize: 13,
    textAlign: "center",
  },
});
