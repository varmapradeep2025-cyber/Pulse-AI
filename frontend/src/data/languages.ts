import type { LanguageOption } from "../types/domain";

export const languages: LanguageOption[] = [
  { code: "en", label: "English", nativeName: "English" },
  { code: "hi", label: "Hindi", nativeName: "हिन्दी" },
  { code: "mr", label: "Marathi", nativeName: "मराठी" },
  { code: "bn", label: "Bengali", nativeName: "বাংলা" },
  { code: "ta", label: "Tamil", nativeName: "தமிழ்" },
  { code: "te", label: "Telugu", nativeName: "తెలుగు" },
  { code: "gu", label: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "kn", label: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", nativeName: "മലയാളം" },
  { code: "pa", label: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
];

export const defaultLanguageCode: LanguageOption["code"] = "en";