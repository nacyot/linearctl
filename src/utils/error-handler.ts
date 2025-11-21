import chalk from 'chalk'

/**
 * Error structure from Linear SDK / GraphQL
 */
interface LinearError {
  extensions?: {
    code?: string
    statusCode?: number
    type?: string
    userPresentableMessage?: string
  }
  message: string
}

interface GraphQLError {
  errors?: LinearError[]
  request?: {
    query: string
    variables?: Record<string, unknown>
  }
  response?: {
    errors?: LinearError[]
    headers?: Record<string, string>
    status?: number
  }
}

/**
 * Exit or throw based on environment
 */
function exitOrThrow(message: string, exitCode = 1): never {
  if (process.env.NODE_ENV === 'test') {
    throw new Error(message)
  }

  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
  process.exit(exitCode)
}

/**
 * Handle Linear API errors and convert them to user-friendly messages
 */
export function handleLinearError(error: unknown): never {
  // Handle GraphQL errors from Linear SDK
  if (isGraphQLError(error)) {
    const gqlError = error as GraphQLError
    const firstError = gqlError.response?.errors?.[0] || gqlError.errors?.[0]

    if (firstError) {
      const statusCode = firstError.extensions?.statusCode || gqlError.response?.status
      const errorCode = firstError.extensions?.code
      const errorType = firstError.extensions?.type
      const userMessage = firstError.extensions?.userPresentableMessage

      // Authentication errors (401)
      if (statusCode === 401 || errorCode === 'AUTHENTICATION_ERROR' || errorType === 'authentication error') {
        console.error(chalk.red('✗ Authentication failed'))
        console.error(chalk.gray('\nYour API key is invalid or expired.'))
        console.error(chalk.gray('Run the following command to set up a new API key:'))
        console.error(chalk.cyan('\n  lc init\n'))
        console.error(chalk.gray('Get your API key from: https://linear.app/settings/api'))
        exitOrThrow('Authentication failed: Your API key is invalid or expired')
      }

      // Permission errors (403)
      if (statusCode === 403 || errorCode === 'FORBIDDEN' || errorType === 'authorization error') {
        console.error(chalk.red('✗ Permission denied'))
        console.error(chalk.gray('\nYou don\'t have permission to access this resource.'))
        console.error(chalk.gray('Check your Linear workspace permissions.'))
        if (userMessage) {
          console.error(chalk.gray(`\nDetails: ${userMessage}`))
        }

        exitOrThrow(`Permission denied: ${userMessage || 'You don\'t have access to this resource'}`)
      }

      // Not found errors (404)
      if (statusCode === 404 || errorCode === 'NOT_FOUND') {
        console.error(chalk.red('✗ Resource not found'))
        console.error(chalk.gray('\nThe requested resource doesn\'t exist.'))
        if (userMessage) {
          console.error(chalk.gray(`\nDetails: ${userMessage}`))
        }

        exitOrThrow(`Resource not found: ${userMessage || 'The requested resource doesn\'t exist'}`)
      }

      // Rate limit errors (429)
      if (statusCode === 429 || errorCode === 'RATE_LIMITED') {
        console.error(chalk.red('✗ Rate limit exceeded'))
        console.error(chalk.gray('\nYou\'ve made too many requests. Please wait a moment and try again.'))
        if (userMessage) {
          console.error(chalk.gray(`\nDetails: ${userMessage}`))
        }

        exitOrThrow(`Rate limit exceeded: ${userMessage || 'Too many requests'}`)
      }

      // Validation errors (400)
      if (statusCode === 400 || errorCode === 'BAD_USER_INPUT' || errorType === 'validation error') {
        console.error(chalk.red('✗ Invalid request'))
        if (userMessage) {
          console.error(chalk.gray(`\n${userMessage}`))
        } else if (firstError.message) {
          console.error(chalk.gray(`\n${firstError.message}`))
        }

        exitOrThrow(`Invalid request: ${userMessage || firstError.message}`)
      }

      // Generic error with user message
      if (userMessage) {
        console.error(chalk.red('✗ Error'))
        console.error(chalk.gray(`\n${userMessage}`))
        exitOrThrow(userMessage)
      }

      // Fallback to error message
      if (firstError.message) {
        console.error(chalk.red('✗ API Error'))
        console.error(chalk.gray(`\n${firstError.message}`))
        exitOrThrow(`API error: ${firstError.message}`)
      }
    }
  }

  // Network errors
  if (error instanceof Error && isNetworkError(error)) {
    console.error(chalk.red('✗ Network error'))
    console.error(chalk.gray('\nUnable to connect to Linear API.'))
    console.error(chalk.gray('Please check your internet connection and try again.'))
    exitOrThrow(`Network error: ${error.message}`)
  }

  // Generic errors
  if (error instanceof Error) {
    console.error(chalk.red('✗ Error'))
    console.error(chalk.gray(`\n${error.message}`))
    exitOrThrow(error.message)
  }

  // Unknown errors
  console.error(chalk.red('✗ Unknown error occurred'))
  console.error(chalk.gray('\nAn unexpected error occurred. Please try again.'))
  exitOrThrow('Unknown error occurred')
}

/**
 * Check if error is a GraphQL error from Linear SDK
 */
function isGraphQLError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const err = error as Record<string, unknown>
  return Boolean(
    err.response && typeof err.response === 'object' ||
    err.errors && Array.isArray(err.errors)
  )
}

/**
 * Check if error is a network error
 */
function isNetworkError(error: Error): boolean {
  const networkKeywords = [
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
    'network',
    'fetch failed',
  ]

  return networkKeywords.some(keyword =>
    error.message.toLowerCase().includes(keyword.toLowerCase())
  )
}

/**
 * Wrap async function with error handler
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args)
    } catch (error) {
      handleLinearError(error)
    }
  }
}
