import { Directory, File, Paths } from "expo-file-system";
import { Image } from "react-native";

import { WEB_BUNDLE_ASSETS, WEB_BUNDLE_VERSION } from "./generated/webBundleAssets";

const WEB_BUNDLE_ROOT = new Directory(Paths.document, "t3-web", WEB_BUNDLE_VERSION);

export type BundledWebUiLocation = {
  indexUri: string;
  rootUri: string;
};

async function copyAsset(relativePath: string, moduleId: number): Promise<void> {
  const pathParts = relativePath.split("/").filter(Boolean);
  const destination = new File(WEB_BUNDLE_ROOT, ...pathParts);
  destination.parentDirectory.create({ idempotent: true, intermediates: true });

  const source = Image.resolveAssetSource(moduleId)?.uri;
  if (!source) {
    throw new Error(`Bundled web asset is unavailable: ${relativePath}`);
  }

  if (destination.exists) {
    destination.delete();
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    await File.downloadFileAsync(source, destination, { idempotent: true });
  } else {
    new File(source).copy(destination);
  }
}

export async function prepareBundledWebUi(): Promise<BundledWebUiLocation> {
  WEB_BUNDLE_ROOT.create({ idempotent: true, intermediates: true });
  await Promise.all(
    Object.entries(WEB_BUNDLE_ASSETS).map(([relativePath, moduleId]) =>
      copyAsset(relativePath, moduleId),
    ),
  );

  return {
    indexUri: new File(WEB_BUNDLE_ROOT, "index.html").uri,
    rootUri: WEB_BUNDLE_ROOT.uri,
  };
}
