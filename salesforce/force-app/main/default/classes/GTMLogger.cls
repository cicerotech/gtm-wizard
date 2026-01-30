/**
 * GTMLogger
 * 
 * Centralized logging utility for GTM Brain Salesforce operations.
 * Provides structured JSON logging for consistent traceability across systems.
 * 
 * Usage:
 *   GTMLogger.log('INFO', 'Operation started', new Map<String, Object>{'accountId' => '001xxx'});
 *   GTMLogger.logError('Operation failed', e, new Map<String, Object>{'context' => 'value'});
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class GTMLogger {
    
    // Log levels
    public static final String LEVEL_DEBUG = 'DEBUG';
    public static final String LEVEL_INFO = 'INFO';
    public static final String LEVEL_WARN = 'WARN';
    public static final String LEVEL_ERROR = 'ERROR';
    
    /**
     * Generate a correlation ID for request tracing
     * Format matches GTM Brain Node.js format
     */
    public static String generateCorrelationId() {
        Long timestamp = System.currentTimeMillis();
        String random = EncodingUtil.convertToHex(Crypto.generateAesKey(128)).substring(0, 9);
        return timestamp + '-' + random;
    }
    
    /**
     * Log a structured message
     * @param level - Log level (DEBUG, INFO, WARN, ERROR)
     * @param message - Log message
     * @param context - Additional context as key-value pairs
     */
    public static void log(String level, String message, Map<String, Object> context) {
        Map<String, Object> entry = new Map<String, Object>{
            'timestamp' => Datetime.now().format('yyyy-MM-dd\'T\'HH:mm:ss.SSSZ'),
            'level' => level,
            'message' => message,
            'service' => 'salesforce-apex',
            'context' => context != null ? context : new Map<String, Object>()
        };
        
        String jsonEntry = JSON.serialize(entry);
        
        // Use appropriate logging level
        if (level == LEVEL_ERROR) {
            System.debug(LoggingLevel.ERROR, jsonEntry);
        } else if (level == LEVEL_WARN) {
            System.debug(LoggingLevel.WARN, jsonEntry);
        } else if (level == LEVEL_DEBUG) {
            System.debug(LoggingLevel.DEBUG, jsonEntry);
        } else {
            System.debug(LoggingLevel.INFO, jsonEntry);
        }
    }
    
    /**
     * Log an info message
     */
    public static void info(String message, Map<String, Object> context) {
        log(LEVEL_INFO, message, context);
    }
    
    /**
     * Log an info message without context
     */
    public static void info(String message) {
        log(LEVEL_INFO, message, null);
    }
    
    /**
     * Log a warning message
     */
    public static void warn(String message, Map<String, Object> context) {
        log(LEVEL_WARN, message, context);
    }
    
    /**
     * Log a debug message
     */
    public static void debug(String message, Map<String, Object> context) {
        log(LEVEL_DEBUG, message, context);
    }
    
    /**
     * Log an error with exception details
     * @param message - Error message
     * @param e - The exception
     * @param context - Additional context
     */
    public static void logError(String message, Exception e, Map<String, Object> context) {
        Map<String, Object> errorContext = context != null ? context.clone() : new Map<String, Object>();
        errorContext.put('errorType', e.getTypeName());
        errorContext.put('errorMessage', e.getMessage());
        errorContext.put('stackTrace', e.getStackTraceString());
        errorContext.put('lineNumber', e.getLineNumber());
        
        log(LEVEL_ERROR, message, errorContext);
    }
    
    /**
     * Log an error without exception
     */
    public static void error(String message, Map<String, Object> context) {
        log(LEVEL_ERROR, message, context);
    }
    
    /**
     * Log operation start - returns correlation ID for use in subsequent logs
     * @param operation - Operation name
     * @param context - Initial context
     * @return Correlation ID to use for the operation
     */
    public static String operationStart(String operation, Map<String, Object> context) {
        String correlationId = generateCorrelationId();
        
        Map<String, Object> startContext = context != null ? context.clone() : new Map<String, Object>();
        startContext.put('correlationId', correlationId);
        startContext.put('operation', operation);
        startContext.put('phase', 'START');
        
        log(LEVEL_INFO, '[START] ' + operation, startContext);
        
        return correlationId;
    }
    
    /**
     * Log operation success
     * @param operation - Operation name
     * @param correlationId - Correlation ID from operationStart
     * @param context - Result context
     */
    public static void operationSuccess(String operation, String correlationId, Map<String, Object> context) {
        Map<String, Object> successContext = context != null ? context.clone() : new Map<String, Object>();
        successContext.put('correlationId', correlationId);
        successContext.put('operation', operation);
        successContext.put('phase', 'SUCCESS');
        successContext.put('result', 'success');
        
        log(LEVEL_INFO, '[SUCCESS] ' + operation, successContext);
    }
    
    /**
     * Log operation failure
     * @param operation - Operation name
     * @param correlationId - Correlation ID from operationStart
     * @param e - The exception
     * @param context - Error context
     */
    public static void operationError(String operation, String correlationId, Exception e, Map<String, Object> context) {
        Map<String, Object> errorContext = context != null ? context.clone() : new Map<String, Object>();
        errorContext.put('correlationId', correlationId);
        errorContext.put('operation', operation);
        errorContext.put('phase', 'ERROR');
        
        logError('[ERROR] ' + operation, e, errorContext);
    }
    
    /**
     * Log for specific Q1 FY26 priority
     * @param priorityId - Priority ID (e.g., 'P1', 'P2')
     * @param operation - Operation name
     * @param message - Log message
     * @param context - Additional context
     */
    public static void priority(String priorityId, String operation, String message, Map<String, Object> context) {
        Map<String, Object> priorityContext = context != null ? context.clone() : new Map<String, Object>();
        priorityContext.put('priority', priorityId);
        priorityContext.put('operation', operation);
        
        log(LEVEL_INFO, '[' + priorityId + '] ' + operation + ': ' + message, priorityContext);
    }
}
