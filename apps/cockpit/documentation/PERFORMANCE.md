# Performance Optimization Guidelines

This document provides guidelines for optimizing performance in the devdrivr cockpit application.

## Overview

Performance optimization is critical for maintaining a responsive user experience in the devdrivr cockpit application. This document outlines key performance considerations, best practices, and optimization techniques specific to this codebase.

## Performance Considerations

### Web Workers

The application uses Web Workers to offload heavy computational tasks from the main thread:

- **Code Formatting**: Prettier-based formatting operations run in a Web Worker
- **Diff Computation**: Text comparison and patch generation operations run in a Web Worker
- **TypeScript Transpilation**: TypeScript to JavaScript compilation runs in a Web Worker
- **XML Processing**: XML validation and processing operations run in a Web Worker

Benefits of using Web Workers:
- Prevents UI blocking during intensive operations
- Maintains application responsiveness
- Enables parallel processing of background tasks

### State Management Optimization

#### Tool State Persistence
- Uses a two-tier system: in-memory cache + debounced SQLite writes
- Reduces database I/O by batching updates
- Provides instant state restoration on tool switches
- Minimizes main thread blocking during state operations

#### Memoization and Caching
- Use `useMemo` for expensive computations
- Cache parsed/processed data when possible
- Implement selective rendering for large datasets
- Use virtualized lists for large data displays

### Component Optimization

#### Render Optimization
- Use `React.memo` for components that render lists
- Implement `shouldComponentUpdate` where appropriate
- Use CSS containment and `content-visibility` for large lists
- Virtualize scrolling for large datasets

#### Event Handling
- Debounce input events to reduce re-renders
- Use `useCallback` for event handlers
- Implement event delegation for repeated UI elements
- Batch DOM updates when possible

## Best Practices

### Memory Management
1. **Component Cleanup**
   - Always clean up subscriptions in `useEffect` cleanup functions
   - Terminate Web Workers when components unmount
   - Clear large data structures when no longer needed

2. **State Management**
   - Use selector functions with Zustand to avoid unnecessary re-renders
   - Minimize the size of stored state objects
   - Use primitive values over complex objects when possible

3. **Resource Management**
   - Clean up event listeners on component unmount
   - Reuse Web Workers instead of creating new ones
   - Cache expensive operations with appropriate TTL

### Code Patterns

#### Performance-Optimized Component Structure
```typescript
// ✅ Good - Memoized component with selective updates
const MyComponent = React.memo(({ data, onUpdate }) => {
  const [value, setValue] = useState(initialValue)
  
  // Memoized expensive computation
  const processedData = useMemo(() => expensiveTransform(data), [data])
  
  // Debounced user input
  const debouncedUpdate = useDebounce((v) => onUpdate(v), 300)
  
  return <div>{processedData}</div>
})
```

#### Efficient State Updates
```typescript
// ✅ Good - Batched state updates
const updateBatch = useCallback(() => {
  setBatch(() => {
    const updates = []
    for (let i = 0; i < items.length; i++) {
      updates.push(expensiveProcess(items[i]))
    }
    return updates
  })
}, [items])
```

### Tool-Specific Optimizations

#### Monaco Editor Performance
- Use `model.dispose()` when editors are unmounted
- Limit syntax highlighting to visible regions
- Use editor options to disable unnecessary features
- Cache editor instances when possible

#### Database Performance
- Use prepared statements for repeated queries
- Batch database operations
- Limit result set sizes in queries
- Use database indexes for frequently queried columns

#### Large Data Handling
- Virtualize lists with windowing
- Implement pagination for result sets
- Use streaming for large data processing
- Debounce search and filter operations

## Monitoring and Debugging

### Performance Metrics
- First Contentful Paint (FCP)
- Time to Interactive (TTI)
- Main thread blocking time
- Memory usage patterns
- Database query performance

### Profiling Tools
- React DevTools Profiler for component performance
- Chrome DevTools Performance tab for runtime analysis
- SQLite query analysis for database performance
- Web Worker performance monitoring

### Common Performance Issues

#### Memory Leaks
- Uncollected Web Workers
- Unsubscribed event listeners
- Large data retained in component state
- Unmounted component updates

#### UI Jank
- Long-running operations on the main thread
- Excessive re-renders
- Non-virtualized large lists
- Synchronous heavy operations

## Implementation Guidelines

### Web Worker Usage
1. Always use `?worker` imports, never `new URL()` with `{ type: 'module' }`
2. List all methods in `useWorker` calls
3. Always null-check before calling worker methods
4. Handle worker termination in component cleanup

### State Management
1. Use selector functions with Zustand
2. Implement proper idempotent initialization guards
3. Use proper state persistence patterns
4. Minimize stored state size

### Data Handling
1. Use streaming for large data sets
2. Implement proper pagination
3. Virtualize large lists
4. Cache appropriately with TTL

### UI Optimization
1. Use CSS containment for large components
2. Implement selective rendering
3. Debounce user input
4. Use proper event delegation
5. Optimize image and asset loading

## Performance Testing

### Monitoring
- Use Performance tab in browser DevTools
- Monitor memory usage with Memory panel
- Test with various data sizes
- Profile on different device capabilities

### Validation
- Test with large data sets
- Verify performance on low-end devices
- Check memory usage patterns
- Validate smoothness of UI interactions