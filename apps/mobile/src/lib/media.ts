import * as ImageManipulator from "expo-image-manipulator";

export async function compressImageToWebP(uri: string): Promise<{
  uri: string;
  width: number;
  height: number;
}> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP }
  );
  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

export async function getFileByteSize(uri: string): Promise<number> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob.size;
}
