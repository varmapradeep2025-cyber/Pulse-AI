import type { TranslationKey } from "../data/translations";
import type {
  SpeechRecognitionErrorKind,
  SpeechSynthesisErrorKind,
} from "../types/speech";

export function recognitionErrorKey(kind: SpeechRecognitionErrorKind): TranslationKey {
  switch (kind) {
    case "not-supported":
      return "voice.notSupported";
    case "not-allowed":
      return "voice.permissionDenied";
    case "audio-capture":
      return "voice.micUnavailable";
    case "network":
      return "voice.networkError";
    case "no-speech":
      return "voice.noSpeech";
    case "language-not-supported":
      return "voice.notSupported";
    case "aborted":
      return "voice.aborted";
    default:
      return "voice.unrecognized";
  }
}

export function synthesisErrorKey(kind: SpeechSynthesisErrorKind): TranslationKey {
  switch (kind) {
    case "unavailable":
      return "voice.synthesisUnavailable";
    case "no-voice":
      return "voice.synthesisUnavailable";
    default:
      return "voice.synthesisError";
  }
}