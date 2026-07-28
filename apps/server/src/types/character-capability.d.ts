interface CharacterCapabilityBaseConfig {
    apiKey: string;
    apiBaseUrl: string;
}
export interface CharacterCapabilityConfig extends CharacterCapabilityBaseConfig {
    llm: {
        temperature: number;
        model: string;
    };
    tts: {
        ssml: string;
        voiceId: string;
        speed: number;
        pitch: number;
    };
    vlm: {
        image: string;
    };
    asr: {
        audio: string;
    };
}

