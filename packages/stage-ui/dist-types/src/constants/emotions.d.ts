export declare enum Emotion {
    Happy = "happy",
    Sad = "sad",
    Angry = "angry",
    Think = "think",
    Surprise = "surprised",
    Awkward = "awkward",
    Question = "question",
    Curious = "curious",
    Neutral = "neutral"
}
export declare const EMOTION_VALUES: Emotion[];
export declare const EmotionHappyMotionName = "Happy";
export declare const EmotionSadMotionName = "Sad";
export declare const EmotionAngryMotionName = "Angry";
export declare const EmotionAwkwardMotionName = "Awkward";
export declare const EmotionThinkMotionName = "Think";
export declare const EmotionSurpriseMotionName = "Surprise";
export declare const EmotionQuestionMotionName = "Question";
export declare const EmotionNeutralMotionName = "Idle";
export declare const EmotionCuriousMotionName = "Curious";
export declare const EMOTION_EmotionMotionName_value: {
    happy: string;
    sad: string;
    angry: string;
    think: string;
    surprised: string;
    awkward: string;
    question: string;
    neutral: string;
    curious: string;
};
export declare const EMOTION_VRMExpressionName_value: {
    happy: string;
    sad: string;
    angry: string;
    think: string;
    surprised: string;
    awkward: string;
    question: string;
    neutral: string;
    curious: string;
};
export declare const EMOTION_SpineAnimationName_value: {
    happy: string;
    sad: string;
    angry: string;
    think: string;
    surprised: string;
    awkward: string;
    question: string;
    neutral: string;
    curious: string;
};
export interface EmotionPayload {
    name: Emotion;
    intensity: number;
}
