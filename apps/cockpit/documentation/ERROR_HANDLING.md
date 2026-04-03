# Error Handling Guide

This document provides comprehensive guidelines for error handling in the devdrivr cockpit application, covering both frontend and backend error management strategies.

## Overview

Proper error handling is essential for creating a robust and user-friendly application. This guide outlines the patterns and practices used for handling errors throughout the devdrivr cockpit application.

## Error Handling Patterns

### Asynchronous Operations

All asynchronous operations should use proper error handling patterns:

```typescript
// ✅ Good - Proper async error handling
async function loadUserData(userId: string) {
  try {
    const response = await fetch(`/api/users/${userId}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    // Log error for debugging
    console.error('Failed to load user data:', error)
    
    // Show user-friendly message
    showToast('Unable to load user data. Please try again.')
    
    // Return safe default
    return null
  }
}
```

### User-Facing Error Messages

Error messages shown to users should be:
- Clear and actionable
- Free of technical jargon
- Context-appropriate
- Provide guidance on next steps

```typescript
// ✅ Good - User-friendly error message
showUserMessage(
  'Unable to save your work. Please check your connection and try again.',
  'error'
)

// ❌ Bad - Technical error message
showUserMessage(
  'Error: NetworkError: Failed to fetch data from /api/save: Type Error',
  'error'
)
```

## Component Error Boundaries

React error boundaries should be used to catch rendering errors:

```typescript
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error boundary caught:', error, errorInfo)
    // Log error to analytics service
    logError(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh the page.</div>
    }
    return this.props.children
  }
}
```

## Database Error Handling

Database operations should handle common SQLite errors gracefully:

```typescript
// Handle database constraint violations
try {
  await db.execute('INSERT INTO users (email) VALUES (?)', [email])
} catch (error) {
  if (error.code === 'SQLITE_CONSTRAINT') {
    showToast('This email is already registered', 'error')
  } else {
    showToast('Unable to save user. Please try again.', 'error')
    console.error('Database error:', error)
  }
}
```

## API Error Handling

API calls should handle various HTTP status codes appropriately:

```typescript
async function fetchApi(url: string) {
  try {
    const response = await fetch(url)
    
    if (response.status === 401) {
      // Handle authentication errors
      redirectToLogin()
      return
    }
    
    if (response.status === 403) {
      // Handle authorization errors
      showAccessDenied()
      return
    }
    
    if (response.status >= 500) {
      // Handle server errors
      showToast('Server error. Please try again later.')
      return
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    return response.json()
  } catch (error) {
    // Handle network errors
    if (error.name === 'TypeError') {
      showToast('Network error. Please check your connection.')
    }
    console.error('API error:', error)
    return null
  }
}
```

## Error Recovery Strategies

### Graceful Degradation

When a feature fails, provide a fallback experience:

```typescript
// Fallback to basic functionality when advanced features fail
function saveDocument(content) {
  try {
    // Try advanced formatting first
    return saveWithFormatting(content)
  } catch (error) {
    console.error('Advanced formatting failed:', error)
    // Fallback to basic save
    return saveWithoutFormatting(content)
  }
}
```

### Data Validation

Validate inputs to prevent errors:

```typescript
function validateAndProcess(input) {
  // Validate required fields
  if (!input || input.trim() === '') {
    throw new Error('Input is required')
  }
  
  // Validate data types
  if (typeof input !== 'string') {
    throw new Error('Input must be a string')
  }
  
  // Validate data format
  try {
    JSON.parse(input)
  } catch (error) {
    throw new Error('Input must be valid JSON')
  }
  
  return processInput(input)
}
```

## Error Logging

### Client-Side Error Logging

```typescript
// Log errors for debugging
function logError(error, context) {
  // Don't log in production to prevent sensitive data exposure
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', error, 'Context:', context)
  }
  
  // Send non-sensitive error information to analytics
  if (window.analytics) {
    window.analytics.track('error', {
      message: error.message,
      name: error.name,
      timestamp: Date.now()
    })
  }
}
```

## Testing Error Cases

### Unit Test Error Handling

```typescript
it('handles API errors gracefully', async () => {
  // Mock API failure
  fetch.mockRejectedValueOnce(new Error('Network error'))
  
  const result = await fetchApi('/test')
  
  expect(result).toBeNull()
  expect(showToast).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Network error. Please check your connection.',
      type: 'error'
    })
  )
})
```

### Integration Test Error Flows

```typescript
it('recovers from database errors', async () => {
  // Simulate database failure
  Database.execute.mockRejectedValueOnce(new Error('DB Error'))
  
  // Component should show error state
  render(<MyComponent />)
  
  expect(screen.getByText('Unable to load data')).toBeInTheDocument()
})
```

## Monitoring and Alerting

### Error Reporting

Implement centralized error reporting for production issues:

```typescript
class ErrorHandler {
  static capture(error, context = {}) {
    // Don't send full error objects in production
    const errorInfo = {
      message: error.message,
      name: error.name,
      timestamp: Date.now(),
      ...context
    }
    
    // In development, log full details
    if (process.env.NODE_ERROR === 'development') {
      console.error('Error:', error, 'Context:', context)
    }
    
    // Send minimal error information to analytics
    if (window.analytics) {
      window.analytics.track('error', errorInfo)
    }
  }
}
```

## Best Practices

### 1. Fail Fast

```typescript
// ✅ Good - Validate early
function processUserInput(input) {
  if (!input) {
    throw new Error('Input required')
  }
  
  if (input.length > 1000) {
    throw new Error('Input too long')
  }
  
  // Process valid input
  return processInput(input)
}
```

### 2. Provide Recovery Paths

```typescript
// ✅ Good - Multiple fallbacks
function saveData(data) {
  try {
    return saveToDatabase(data)
  } catch (error) {
    console.error('Database save failed:', error)
    try {
      return saveToFile(data)
    } catch (fileError) {
      console.error('File save failed:', fileError)
      return saveToLocalStorage(data)
    }
  }
}
```

### 3. Preserve User Data

```typescript
// ✅ Good - Don't lose user work
function handleSaveError(data) {
  // Save to local storage as backup
  localStorage.setItem('backup_data', JSON.stringify(data))
  
  // Show error message
  showToast('Unable to save. Your data is backed up locally.', 'warning')
  
  // Try again later
  retrySave(data, 30000) // 30 second retry
}
```

## Error Handling in Workers

Web Workers should handle errors gracefully:

```typescript
// worker.ts
self.addEventListener('message', (event) => {
  try {
    const result = processExpensiveOperation(event.data)
    self.postMessage({ result })
  } catch (error) {
    // Send error back to main thread
    self.postMessage({ 
      error: error.message || 'Unknown error in worker' 
    })
  }
})

// main.ts
worker.onerror = (error) => {
  console.error('Worker error:', error)
  showToast('Processing failed. Using simplified processing.')
}
```

## Security Considerations

### Information Disclosure

Never expose internal details in user-facing messages:

```typescript
// ❌ Bad - Exposes implementation details
showToast('SQLite Error: no such table: users')

// ✅ Good - User-friendly message
showToast('Unable to load your data. Please try refreshing.')
```

### Error Boundaries for Security

```typescript
// Hide sensitive error details
function logSecurityError(error) {
  // Log full details server-side only
  if (process.env.NODE_ENV === 'development') {
    console.error('Security error:', error)
  } else {
    // Send minimal information to client
    showToast('Security error occurred', 'error')
  }
}
```

## Performance Impact

### Error Handling Performance

Monitor performance impact of error handling:

```typescript
// ✅ Good - Efficient error handling
function handleJsonParse(jsonString) {
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    // Fast path for common errors
    if (error.message.includes('position')) {
      throw new Error('Invalid JSON format')
    }
    throw error
  }
}
```

## Testing Error Handling

### Comprehensive Error Testing

```typescript
// Test success and error cases
it('handles invalid input', () => {
  expect(() => validateInput('')).toThrow('Input required')
  expect(() => validateInput(null)).toThrow('Input required')
})

it('handles valid input', () => {
  expect(validateInput('valid')).toBe('valid')
})

it('handles edge cases', () => {
  // Test boundary conditions
  expect(() => validateInput('a'.repeat(1001))).toThrow('Input too long')
})
```

## Error Recovery

### Automatic Recovery

Implement automatic recovery where possible:

```typescript
class AutoRecovery {
  static async withRetry(operation, maxRetries = 3) {
    let lastError
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
        }
      }
    }
    
    throw lastError
  }
}
```

## Common Error Patterns

### Network Error Handling

```typescript
async function handleNetworkCall(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response
  } catch (error) {
    // Handle different network error types
    if (error.name === 'TypeError') {
      showToast('Network connection error')
    } else if (error.message.includes('HTTP')) {
      showToast('Server error. Please try again.')
    } else {
      showToast('An error occurred. Please try again.')
    }
  }
}
```

### Database Error Handling

```typescript
function handleDatabaseError(error) {
  if (error.code === 'SQLITE_CONSTRAINT') {
    return 'Data already exists'
  } else if (error.code === 'SQLITE_FULL') {
    return 'Storage full. Please free up space.'
  } else {
    return 'Database error. Please try again.'
  }
}
```