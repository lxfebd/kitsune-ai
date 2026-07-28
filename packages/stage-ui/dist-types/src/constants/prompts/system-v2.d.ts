declare function message(prefix: string, suffix: string): {
    role: "system";
    content: string;
};
export default message;
