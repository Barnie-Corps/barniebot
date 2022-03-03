const mongoose = require('mongoose');
const URI = process.env.DB;
mongoose.connect(URI, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
}, () => {
	console.log('[LOG] Connected to the database');
});