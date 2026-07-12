import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_DATA_URL_LENGTH,
  MAX_IMAGE_OUTPUT_BYTES,
} from "../constants.js";
import { imageError } from "../errors.js";

const MIN_IMAGE_DIMENSION = 240;
const QUALITIES = [0.72, 0.6, 0.48, 0.38, 0.28, 0.2];
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(imageError("image/convert-failed", "ছবি রূপান্তর করা যায়নি — অন্য ফরম্যাটের ছবি চেষ্টা করুন"));
    reader.readAsDataURL(blob);
  });
}

function compressToBlob(img, width, height, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(
      imageError("image/process-failed", "ছবি প্রসেস করা যায়নি — ব্রাউজার রিফ্রেশ করে আবার চেষ্টা করুন")
    );
  }
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              imageError(
                "image/process-failed",
                "ছবি প্রসেস করা যায়নি — ব্রাউজার রিফ্রেশ করে আবার চেষ্টা করুন"
              )
            );
            return;
          }
          resolve(blob);
        },
        "image/webp",
        quality
      );
    } catch {
      reject(
        imageError(
          "image/process-failed",
          "ছবি প্রসেস করা যায়নি — ব্রাউজার রিফ্রেশ করে আবার চেষ্টা করুন"
        )
      );
    }
  });
}

function shrinkDimensions(width, height) {
  const nextW = Math.round(width * 0.78);
  const nextH = Math.round(height * 0.78);
  if (Math.max(nextW, nextH) < MIN_IMAGE_DIMENSION) {
    const scale = MIN_IMAGE_DIMENSION / Math.max(width, height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }
  return { width: nextW, height: nextH };
}

function fitsLimit(blob, dataUrl) {
  return (
    blob.size <= MAX_IMAGE_OUTPUT_BYTES &&
    dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH
  );
}

function validateImageFile(file) {
  if (!file) {
    throw imageError("image/no-file", "কোনো ছবি বেছে নেওয়া হয়নি");
  }
  if (!file.size) {
    throw imageError("image/empty-file", "ছবি ফাইল খালি বা নষ্ট — অন্য ছবি বেছে নিন");
  }

  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  const okExt = /\.(jpe?g|png|webp|gif)$/.test(name);
  const okType = !type || ALLOWED_TYPES.has(type) || type === "image/jpg";

  if (type && !type.startsWith("image/")) {
    throw imageError(
      "image/invalid-type",
      "শুধু JPEG, PNG, WebP বা GIF ছবি পাঠানো যাবে"
    );
  }
  if (type.startsWith("image/") && !okType) {
    throw imageError(
      "image/invalid-type",
      "শুধু JPEG, PNG, WebP বা GIF ছবি পাঠানো যাবে"
    );
  }
  if (!type && !okExt) {
    throw imageError(
      "image/invalid-type",
      "শুধু JPEG, PNG, WebP বা GIF ছবি পাঠানো যাবে"
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw imageError(
      "image/too-large",
      "ছবির সাইজ ৫ MB এর বেশি — ছোট ছবি বেছে নিন"
    );
  }
}

export function compressImage(file, maxDim = MAX_IMAGE_DIMENSION) {
  return new Promise((resolve, reject) => {
    try {
      validateImageFile(file);
    } catch (err) {
      reject(err);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        if (!img.naturalWidth || !img.naturalHeight) {
          reject(
            imageError(
              "image/load-failed",
              "ছবি খোলা যায়নি — ফাইল নষ্ট বা এই ব্রাউজারে সাপোর্ট নেই"
            )
          );
          return;
        }

        let width = img.naturalWidth;
        let height = img.naturalHeight;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        for (let pass = 0; pass < 12; pass++) {
          for (const quality of QUALITIES) {
            const blob = await compressToBlob(img, width, height, quality);
            const dataUrl = await blobToDataUrl(blob);
            if (fitsLimit(blob, dataUrl)) {
              resolve({ blob, width, height, dataUrl, bytes: blob.size });
              return;
            }
          }

          if (Math.max(width, height) <= MIN_IMAGE_DIMENSION) {
            break;
          }
          ({ width, height } = shrinkDimensions(width, height));
        }

        reject(
          imageError(
            "image/too-complex",
            "ছবি কম্প্রেস করেও বড় রয়ে গেছে — অন্য/ছোট ছবি পাঠান"
          )
        );
      } catch (err) {
        if (err?.code?.startsWith("image/")) {
          reject(err);
          return;
        }
        reject(
          imageError(
            "image/compress-failed",
            "ছবি ছোট করা যায়নি — অন্য ছবি বেছে নিন"
          )
        );
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        imageError(
          "image/load-failed",
          "ছবি খোলা যায়নি — ফাইল নষ্ট বা এই ব্রাউজারে সাপোর্ট নেই"
        )
      );
    };
    img.src = url;
  });
}

/** Inline base64 only — Firebase Storage ব্যবহার করে না */
export async function prepareImageForMessage(file, onProgress) {
  onProgress?.(0.2);
  const result = await compressImage(file);
  onProgress?.(0.85);

  if (!fitsLimit(result.blob, result.dataUrl)) {
    throw imageError(
      "image/too-complex",
      "ছবি কম্প্রেস করেও বড় রয়ে গেছে — অন্য/ছোট ছবি পাঠান"
    );
  }

  onProgress?.(1);
  return {
    imageUrl: result.dataUrl,
    imageThumbUrl: result.dataUrl,
    width: result.width,
    height: result.height,
  };
}
