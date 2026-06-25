const dns = require("dns")
dns.setServers([
  "1.1.1.1",
  '8.8.8.8'
])

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const app = express();

dotenv.config();

app.use(cors())
app.use(express.json())

const port = process.env.PORT || 8000;


// const uri = process.env.MONGODB_URI
const uri = "mongodb+srv://medi_queue_tutor:PV2E7mQnEk4bP21Q@cluster0.ret3q0v.mongodb.net/?appName=Cluster0";

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`))

console.log(JWKS)

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;

  const token = authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const JWKS = createRemoteJWKSet(
      new URL('http://localhost:3000/api/auth/jwks')
    )
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  }

  catch (error) {
    console.error('Token validation failed:', error)
    throw error
    return res.status(401).json({ message: "Unauthorized" });
  }

}


async function run() {
  try {

    await client.connect();

    const db = client.db("mediqueue")
    const tutorsCollection = db.collection("tutors")
    const sessionCollection = db.collection("booked_session")


    app.get('/tutors/all', async (req, res) => {
      const cursor = tutorsCollection.find()
      const result = await cursor.toArray()
      res.send(result)
    });

    app.get('/tutors', async (req, res) => {

      // const { search } = req.query;
      // let cursor;

      // if (search) {
      //   cursor = tutorsCollection.find({ title: { $eq: search } });
      // } else { const cursor = tutorsCollection.find().limit(6) }

      const cursor = tutorsCollection.find().limit(6)
      const result = await cursor.toArray()

      res.send(result)
    });

    app.get('/tutors/:tutorId', verifyToken, async (req, res) => {
      const { tutorId } = req.params;
      const query = { _id: new ObjectId(tutorId) }
      const result = await tutorsCollection.findOne(query)
      res.send(result)
    });

    app.get("/booked-session/:userId", async (req, res) => {
      const {userId} = req.params
      const result = await sessionCollection.find({userId: userId}).toArray();
      res.send(result)
    })

    app.patch("/booked-session/:tutorId", verifyToken, async (req, res) => {
      const { tutorId } = req.params;
      const tutorData = req.body;

      const course = await tutorsCollection.find({ _id: new ObjectId(tutorId) })

      if (!course) {
        req.status(404).json({ message: "Tutors Not Found" })
      }

      await tutorsCollection.updateOne(
        { _id: new ObjectId(tutorId) },
        { $inc: { bookedCount: 1 } }
      );

      const result = await sessionCollection.insertOne({
        ...tutorData,
      });

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