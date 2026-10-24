// Environment variable names in messages. A qa-config field such as `password_env` holds the name of
// the variable that carries a secret, never the secret. When the variable is missing, a message
// names it; and in case a secret was pasted into the field by mistake, a message prints the field
// only when it has the shape of a variable name (the schema's `envVar`). The `redact` in the name
// also tells static analysers that the result is not a secret. No imports and no I/O: helpers/ and
// scripts/ both load it.

/** The `envVar` pattern of schemas/qa-config.schema.json; a test keeps the two equal. */
export const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;

/** What a message shows instead of a value that is not a variable name. */
export const NOT_A_NAME = '[redacted: not an environment variable name]';

/** `name` when it has the shape of an environment variable name, otherwise `NOT_A_NAME`. */
export function redactUnlessVariableName(name) {
  return typeof name === 'string' && ENV_VAR_NAME.test(name) ? name : NOT_A_NAME;
}

/** The error message for a variable that `why` needs and the environment does not set. */
export function missingVariableMessage(why, name) {
  return `${why} needs the environment variable ${redactUnlessVariableName(name)}, which is not set.`;
}
