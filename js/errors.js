export function formatFirebaseError(err) {
  const code = err?.code || "";
  const message = err?.message || String(err || "অজানা ত্রুটি");

  if (message.includes("রুম পূর্ণ") || message.includes("রুম পাওয়া যায়নি")) {
    return message;
  }

  if (
    message === "Internal error." ||
    message.includes("UnknownError") ||
    err?.name === "UnknownError"
  ) {
    return "ব্রাউজার স্টোরেজ সমস্যা — সাইট ডেটা/ক্যাশ মুছে পেজ রিফ্রেশ করুন";
  }

  switch (code) {
    case "internal":
      return "Firebase internal error — firestore.rules Publish করুন এবং পেজ রিফ্রেশ করুন";
    case "permission-denied":
      return "Firestore অনুমতি নেই — Anonymous Auth চালু করুন এবং firestore.rules Publish করুন";
    case "auth/operation-not-allowed":
      return "Anonymous Authentication Firebase-এ enable করুন";
    case "auth/unauthorized-domain":
      return "Firebase Console → Authentication → Settings → Authorized domains-এ localhost যোগ করুন";
    case "auth/network-request-failed":
      return "ইন্টারনেট সংযোগ সমস্যা — আবার চেষ্টা করুন";
    case "unavailable":
      return "Firebase সাময়িকভাবে unavailable — কিছুক্ষণ পর চেষ্টা করুন";
    case "failed-precondition":
      return "Firestore index লাগতে পারে — Console-এর লিংক থেকে index তৈরি করুন";
    case "invalid-argument":
      return "অবৈধ ডেটা — সব ফিল্ড সঠিকভাবে পূরণ করুন";
    case "storage/unauthorized":
    case "storage/unauthenticated":
      return "ছবি আপলোডের অনুমতি নেই — লগইন করে আবার চেষ্টা করুন";
    case "storage/bucket-not-found":
    case "storage/object-not-found":
      return "Firebase Storage চালু নেই বা bucket সঠিক নয় — Console → Storage → Get started, তারপর storage.rules deploy করুন";
    case "storage/canceled":
      return "আপলোড বাতিল হয়েছে";
    case "storage/quota-exceeded":
      return "Storage সীমা পূর্ণ — পুরনো ফাইল মুছুন বা প্ল্যান আপগ্রেড করুন";
    default:
      break;
  }

  if (code.startsWith("storage/") || message.includes("Firebase Storage")) {
    if (/404|not found/i.test(message)) {
      return "Firebase Storage bucket পাওয়া যায়নি — Console → Storage চালু করুন এবং js/firebase-config.js-এ সঠিক storageBucket দিন";
    }
    return "ছবি আপলোড ব্যর্থ — Storage rules deploy করুন: firebase deploy --only storage";
  }

  if (/https?:\/\//.test(message) && message.length > 120) {
    return "Firebase কনফিগারেশন ত্রুটি — Anonymous Auth ও Firestore rules যাচাই করুন";
  }

  return message;
}

/** ছবি পাঠানোর সব ধাপের জন্য স্পষ্ট বাংলা মেসেজ */
export function formatImageSendError(err) {
  const code = err?.code || "";
  const message = err?.message || String(err || "");

  switch (code) {
    case "image/no-file":
      return "কোনো ছবি বেছে নেওয়া হয়নি";
    case "image/not-ready":
      return "রুমে লগইন করে আবার ছবি পাঠান";
    case "image/invalid-type":
      return "শুধু JPEG, PNG, WebP বা GIF ছবি পাঠানো যাবে";
    case "image/too-large":
      return "ছবির সাইজ ৫ MB এর বেশি — ছোট ছবি বেছে নিন";
    case "image/empty-file":
      return "ছবি ফাইল খালি বা নষ্ট — অন্য ছবি বেছে নিন";
    case "image/load-failed":
      return "ছবি খোলা যায়নি — ফাইল নষ্ট বা এই ব্রাউজারে সাপোর্ট নেই";
    case "image/convert-failed":
      return "ছবি রূপান্তর করা যায়নি — অন্য ফরম্যাটের ছবি চেষ্টা করুন";
    case "image/process-failed":
      return "ছবি প্রসেস করা যায়নি — ব্রাউজার রিফ্রেশ করে আবার চেষ্টা করুন";
    case "image/compress-failed":
      return "ছবি ছোট করা যায়নি — অন্য ছবি বেছে নিন";
    case "image/too-complex":
      return "ছবি কম্প্রেস করেও বড় রয়ে গেছে — অন্য/ছোট ছবি পাঠান";
    case "permission-denied":
      return "ছবি পাঠানোর অনুমতি নেই — লগইন ও রুম মেম্বারশিপ যাচাই করুন";
    case "unauthenticated":
      return "সেশন শেষ — আবার লগইন করে ছবি পাঠান";
    case "resource-exhausted":
      return "সার্ভার সীমা পূর্ণ — কিছুক্ষণ পর আবার চেষ্টা করুন";
    case "deadline-exceeded":
      return "ছবি পাঠাতে সময় লেগেছে — ইন্টারনেট চেক করে আবার চেষ্টা করুন";
    case "unavailable":
    case "auth/network-request-failed":
      return "ইন্টারনেট সংযোগ নেই বা দুর্বল — সংযোগ ঠিক করে আবার পাঠান";
    case "invalid-argument":
      return "ছবির ডেটা অবৈধ — অন্য ছবি বেছে নিন";
    case "cancelled":
      return "ছবি পাঠানো বাতিল হয়েছে";
    default:
      break;
  }

  // আমাদের নিজস্ব বাংলা মেসেজ থাকলে সরাসরি দেখাও
  if (/[\u0980-\u09FF]/.test(message) && message.length < 160) {
    return message;
  }

  if (!navigator.onLine) {
    return "অফলাইন আছেন — সংযোগ এলে ছবি পাঠানো যাবে";
  }

  const firebaseMsg = formatFirebaseError(err);
  if (firebaseMsg && firebaseMsg !== message) {
    return `ছবি পাঠানো যায়নি — ${firebaseMsg}`;
  }

  return "ছবি পাঠানো যায়নি — আবার চেষ্টা করুন";
}

export function imageError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
