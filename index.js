const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const app = express();

dotenv.config();
app.use(cors())

const port = process.env.PORT || 8000;


const uri = process.env.MONGODB_URI



const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    await client.connect();

    const db = client.db("mediqueue")
    const tutorsCollection = db.collection("tutors")


    app.get('/tutors/all', async (req, res) => {
      const cursor = tutorsCollection.find()
      const result = await cursor.toArray()
      res.send(result)
    });

    app.get('/tutors', async (req, res) => {
      const cursor = tutorsCollection.find().limit(6)
      const result = await cursor.toArray()
      res.send(result)
    });

    app.get('/tutors/:tutorId', async (req, res) => {
      const { tutorId } = req.params;
      const query = { _id: new ObjectId(tutorId) }
      const result = await tutorsCollection.findOne(query)
      res.send(result)
    });



  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close(); 
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});