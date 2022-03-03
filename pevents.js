process.on('uncaughtException', function(error) {
  console.log(error.stack);
});
process.on('unhandledRejection', function(error) {
  console.log(error.stack);
});
process.on("unhandledPromiseRejection", function(error) {
  console.log(error.stack);
});