export function handler(event, context, callback) {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'hello endpoint',
      event,
      context
    })
  };

  callback(null, response);
}
