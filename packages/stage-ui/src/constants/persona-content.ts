/**
 * Persona 内容常量
 *
 * 这个文件现在只提供工具函数，不再硬编码任何角色内容。
 * 角色信息应该从用户创建的角色卡中读取。
 */

/**
 * 从 soul 内容中提取简短版本（用于截断场景）
 */
export function extractSoulSummary(fullContent: string, maxLength = 1500): string {
  if (fullContent.length <= maxLength)
    return fullContent

  const sections = fullContent.split('\n\n')
  let result = ''

  for (const section of sections) {
    if (result.length + section.length + 2 > maxLength) {
      if (section.startsWith('##') && result.length + section.length + 2 <= maxLength * 1.1) {
        result += `\n\n${section}`
      }
      break
    }
    result += `${result ? '\n\n' : ''}${section}`
  }

  return result || fullContent.slice(0, maxLength)
}

/**
 * 从 identity 内容中提取简短版本
 */
export function extractIdentitySummary(fullContent: string, maxLength = 800): string {
  if (fullContent.length <= maxLength)
    return fullContent

  return fullContent.slice(0, maxLength)
}
