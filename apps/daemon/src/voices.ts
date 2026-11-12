import { auditionVoice, filterVoices, installedVoices } from "@mockingbird/audio";

export function voiceTools() {
  return [
    {
      name: "voice_list",
      description:
        "List installed local macOS voices, filter by language (en or en_AU) and accent country code (AU). Includes sample text and exact voice name. No downloads or external service.",
      inputSchema: {
        type: "object",
        properties: { language: { type: "string" }, accent: { type: "string" } },
      },
      run: async (a: Record<string, unknown>) => {
        for (const key of ["language", "accent"])
          if (a[key] !== undefined && typeof a[key] !== "string")
            throw new Error(`${key} must be a string`);
        return JSON.stringify({
          voices: filterVoices(await installedVoices(), {
            language: a.language as string | undefined,
            accent: a.accent as string | undefined,
          }),
          note: "Only installed voices. Accent metadata does not establish perceived accent or quality.",
        });
      },
    },
    {
      name: "voice_audition",
      description:
        "Speak supplied text with one installed local macOS voice into a new 48 kHz PCM WAV. Call separately for each audition. No cloud, downloads or credits. Listen before choosing.",
      inputSchema: {
        type: "object",
        properties: {
          voice: { type: "string" },
          text: { type: "string" },
          out: { type: "string" },
          rate: { type: "number" },
        },
        required: ["voice", "text", "out"],
      },
      run: async (a: Record<string, unknown>) => {
        if (typeof a.voice !== "string" || typeof a.text !== "string" || typeof a.out !== "string")
          throw new Error("Give voice, text (1–5000 characters), and an output .wav path");
        if (a.rate != null && typeof a.rate !== "number")
          throw new Error("rate must be 80–350 words per minute");
        const result = await auditionVoice({
          voice: a.voice,
          text: a.text,
          out: a.out,
          rate: a.rate ?? undefined,
        });
        return JSON.stringify({
          ...result,
          note: "Accent is installed voice metadata. Listen to the audition before choosing.",
        });
      },
    },
  ];
}
