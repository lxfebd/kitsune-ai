/**
 * Persona 内容常量
 *
 * 这个文件现在只提供工具函数，不再硬编码任何角色内容。
 * 角色信息应该从用户创建的角色卡中读取。
 */
/**
 * 从 soul 内容中提取简短版本（用于截断场景）
 */
export declare function extractSoulSummary(fullContent: string, maxLength?: number): string;
/**
 * 从 identity 内容中提取简短版本
 */
export declare function extractIdentitySummary(fullContent: string, maxLength?: number): string;
