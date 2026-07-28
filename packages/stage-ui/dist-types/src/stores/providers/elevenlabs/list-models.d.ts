export declare const models: {
    model_id: string;
    name: string;
    can_be_finetuned: boolean;
    can_do_text_to_speech: boolean;
    can_do_voice_conversion: boolean;
    can_use_style: boolean;
    can_use_speaker_boost: boolean;
    serves_pro_voices: boolean;
    token_cost_factor: number;
    description: string;
    requires_alpha_access: boolean;
    max_characters_request_free_user: number;
    max_characters_request_subscribed_user: number;
    maximum_text_length_per_request: number;
    languages: {
        language_id: string;
        name: string;
    }[];
    model_rates: {
        character_cost_multiplier: number;
    };
    concurrency_group: string;
}[];
