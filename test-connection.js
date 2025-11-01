const mongoose = require('mongoose');
   require('dotenv').config();

   console.log('🔄 Attempting to connect to MongoDB...');
   console.log('Using MongoDB URI from .env file\n');

   mongoose.connect(process.env.MONGODB_URI)
     .then(() => {
       console.log('✅ MongoDB Connected Successfully!');
       console.log('📁 Database:', mongoose.connection.name);
       console.log('🌐 Host:', mongoose.connection.host);
       console.log('\n🎉 Your MongoDB setup is working!\n');
       process.exit(0);
     })
     .catch(err => {
       console.error('❌ MongoDB Connection Failed!');
       console.error('Error:', err.message);
       console.error('\nPlease check:');
       console.error('1. Your password in .env file is correct');
       console.error('2. Password special characters are URL encoded');
       console.error('3. Network access is set to 0.0.0.0/0 in MongoDB Atlas\n');
       process.exit(1);
     });