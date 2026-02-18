/**
 * Repository Index
 * Central export for all database repositories.
 */
module.exports = {
  intentRepo: require('./intentRepository'),
  pipelineSnapshotRepo: require('./pipelineSnapshotRepository'),
  calendarRepo: require('./calendarRepository'),
  telemetryRepo: require('./telemetryRepository'),
  transcriptRepo: require('./transcriptRepository'),
  analyticsRepo: require('./analyticsRepository'),
  queryLogRepo: require('./queryLogRepository'),
};
