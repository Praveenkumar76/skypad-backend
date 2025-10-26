require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Problem = require('../src/models/Problem');

async function checkProblems() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const totalProblems = await Problem.countDocuments({ isActive: true });
    console.log(`\nTotal active problems in database: ${totalProblems}`);

    const problems = await Problem.find({ isActive: true })
      .select('title difficulty tags')
      .limit(20);

    console.log('\nFirst 20 problems:');
    problems.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title} [${p.difficulty}] - Tags: ${p.tags?.join(', ') || 'none'}`);
    });

    await mongoose.connection.close();
    console.log('\nConnection closed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkProblems();
