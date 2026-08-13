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

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}))

app.use(express.json())

const port = process.env.PORT;

const uri = process.env.MONGODB_URI

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
)

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
    return res.status(401).json({
      message: "Unauthorized"
    });
  }

  try {

    const JWKS = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
    )

    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;

    console.log("AUTH USER:", {
      sub: payload?.sub,
      id: payload?.id,
      email: payload?.email,
    });

    next();

  }

  catch (error) {

    console.error("JWT ERROR:", error);

    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired token"
    });

  }
}


async function run() {
  try {

    const db = client.db("mediqueue")
    const tutorsCollection = db.collection("tutors")
    const sessionCollection = db.collection("booked_session")


    await tutorsCollection.updateMany(
      { totalSlot: { $exists: false } },
      {
        $set: {
          totalSlot: 10,
          updatedAt: new Date(),
        },
      }
    );


    // GET ALL TUTORS

    app.get('/tutors/all', async (req, res) => {
      try {

        const cursor = tutorsCollection.find()
        const result = await cursor.toArray()

        res.send(result)

      } catch (error) {

        console.error("Get all tutors error:", error)

        res.status(500).json({
          message: "Failed to fetch tutors"
        })

      }
    });


    // GET FIRST 6 TUTORS

    app.get('/tutors', async (req, res) => {
      try {

        const cursor = tutorsCollection.find().limit(6)
        const result = await cursor.toArray()

        res.send(result)

      } catch (error) {

        console.error("Get tutors error:", error)

        res.status(500).json({
          message: "Failed to fetch tutors"
        })

      }
    });


    // GET USER'S TUTORS

    app.get('/tutors/user/:userId', verifyToken, async (req, res) => {
      try {

        const { userId } = req.params;

        const loggedInUserId =
          req.user?.sub ||
          req.user?.id;

        if (!loggedInUserId) {
          return res.status(401).json({
            message: "Unauthorized"
          });
        }

        // User can only request their own tutors
        if (userId !== loggedInUserId) {
          return res.status(403).json({
            message: "Forbidden"
          });
        }

        const result = await tutorsCollection
          .find({
            userId: loggedInUserId
          })
          .sort({
            createdAt: -1
          })
          .toArray();

        res.send(result);

      } catch (error) {

        console.error("Get user tutors error:", error);

        res.status(500).json({
          message: "Failed to fetch your tutors"
        });

      }
    });


    // ADD TUTOR

    app.post('/tutors', verifyToken, async (req, res) => {
      try {

        const userId =
          req.user?.sub ||
          req.user?.id;

        if (!userId) {
          return res.status(401).json({
            message: "Unauthorized"
          });
        }

        const tutorData = {
          ...req.body,

          userId: userId,

          bookedCount: 0,

          totalSlot:
            Number(req.body.totalSlot) ||
            Number(req.body.totalSlots) ||
            10,

          createdAt: new Date(),

          updatedAt: new Date(),
        };

        // Keep both names consistent with your frontend
        tutorData.totalSlots = tutorData.totalSlot;

        const result = await tutorsCollection.insertOne(tutorData);

        const insertedTutor = await tutorsCollection.findOne({
          _id: result.insertedId
        });

        res.status(201).json({
          success: true,
          message: "Tutor added successfully",

          insertedId: result.insertedId,

          tutor: insertedTutor
        });

      } catch (error) {

        console.error("Add tutor error:", error);

        res.status(500).json({
          success: false,
          message: "Failed to save tutor"
        });

      }
    });


    // GET SINGLE TUTOR

    app.get('/tutors/:tutorId', verifyToken, async (req, res) => {
      try {

        const { tutorId } = req.params;

        if (!ObjectId.isValid(tutorId)) {
          return res.status(400).json({
            message: "Invalid tutor ID"
          });
        }

        const query = {
          _id: new ObjectId(tutorId)
        }

        const result = await tutorsCollection.findOne(query)

        if (!result) {
          return res.status(404).json({
            message: "Tutor not found"
          });
        }

        res.send(result)

      } catch (error) {

        console.error("Get tutor error:", error);

        res.status(500).json({
          message: "Failed to fetch tutor"
        });

      }
    });


    // UPDATE TUTOR

    app.patch('/tutors/:tutorId', verifyToken, async (req, res) => {
      try {

        const { tutorId } = req.params;

        const userId =
          req.user?.sub ||
          req.user?.id;

        console.log("UPDATE TUTOR");
        console.log("Tutor ID:", tutorId);
        console.log("Logged in user:", userId);

        if (!userId) {
          return res.status(401).json({
            message: "Unauthorized"
          });
        }

        if (!ObjectId.isValid(tutorId)) {
          return res.status(400).json({
            message: "Invalid tutor ID"
          });
        }

        const tutorObjectId = new ObjectId(tutorId);


        // Find tutor belonging to logged-in user

        const tutor = await tutorsCollection.findOne({
          _id: tutorObjectId,
          userId: userId
        });


        if (!tutor) {

          console.log("Tutor ownership check failed");

          return res.status(404).json({
            message: "Tutor not found or you are not the owner"
          });

        }


        const updateData = {
          ...req.body,

          userId: userId,

          updatedAt: new Date(),
        };


        // Don't allow these fields to be changed

        delete updateData._id;
        delete updateData.bookedCount;
        delete updateData.createdAt;


        // Keep slot names consistent

        if (updateData.totalSlots !== undefined) {
          updateData.totalSlot = Number(updateData.totalSlots);
        }

        if (updateData.totalSlot !== undefined) {
          updateData.totalSlot = Number(updateData.totalSlot);
          updateData.totalSlots = Number(updateData.totalSlot);
        }


        const result = await tutorsCollection.updateOne(
          {
            _id: tutorObjectId,
            userId: userId
          },

          {
            $set: updateData
          }
        );


        if (result.matchedCount === 0) {

          return res.status(404).json({
            message: "Tutor not found"
          });

        }


        const updatedTutor = await tutorsCollection.findOne({
          _id: tutorObjectId
        });


        return res.json({
          success: true,

          message: "Tutor updated successfully",

          tutor: updatedTutor
        });


      } catch (error) {

        console.error("Update tutor error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to update tutor"
        });

      }
    });


    // DELETE TUTOR

    app.delete('/tutors/:tutorId', verifyToken, async (req, res) => {
      try {

        const { tutorId } = req.params;

        const userId =
          req.user?.sub ||
          req.user?.id;


        console.log("DELETE TUTOR");
        console.log("Tutor ID:", tutorId);
        console.log("Logged in user:", userId);


        if (!userId) {
          return res.status(401).json({
            message: "Unauthorized"
          });
        }


        if (!ObjectId.isValid(tutorId)) {
          return res.status(400).json({
            message: "Invalid tutor ID"
          });
        }


        const tutorObjectId = new ObjectId(tutorId);


        // Find tutor belonging to logged-in user

        const tutor = await tutorsCollection.findOne({
          _id: tutorObjectId,
          userId: userId
        });


        if (!tutor) {

          console.log("Tutor ownership check failed");

          return res.status(404).json({
            message: "Tutor not found or you are not the owner"
          });

        }


        const result = await tutorsCollection.deleteOne({
          _id: tutorObjectId,
          userId: userId
        });


        if (result.deletedCount !== 1) {

          return res.status(400).json({
            message: "Tutor could not be deleted"
          });

        }


        return res.json({
          success: true,
          message: "Tutor deleted successfully"
        });


      } catch (error) {

        console.error("Delete tutor error:", error);

        return res.status(500).json({
          success: false,
          message: "Failed to delete tutor"
        });

      }
    });


    // GET USER'S BOOKED SESSIONS

    app.get("/booked-session/:userId", verifyToken, async (req, res) => {
      try {

        const { userId } = req.params;

        const loggedInUserId =
          req.user?.sub ||
          req.user?.id;


        if (userId !== loggedInUserId) {

          return res.status(403).json({
            message: "Forbidden"
          });

        }


        const result = await sessionCollection.find({
          userId: userId
        }).toArray();


        res.send(result);


      } catch (error) {

        console.error("Get booked sessions error:", error);

        res.status(500).json({
          message: "Failed to fetch booked sessions"
        });

      }
    })


    // BOOK SESSION

    app.patch("/booked-session/:tutorId", verifyToken, async (req, res) => {
      try {

        const { tutorId } = req.params;

        const userId =
          req.user?.sub ||
          req.user?.id;


        if (!ObjectId.isValid(tutorId)) {

          return res.status(400).json({
            message: "Invalid tutor ID",
          });

        }


        const tutorObjectId = new ObjectId(tutorId);


        const tutor = await tutorsCollection.findOne({
          _id: tutorObjectId,
        });


        if (!tutor) {

          return res.status(404).json({
            message: "Tutor not found",
          });

        }


        // SESSION DATE CHECK

        if (tutor.sessionStartDate) {

          const today = new Date();

          today.setHours(0, 0, 0, 0);


          const sessionDate =
            new Date(tutor.sessionStartDate);

          sessionDate.setHours(0, 0, 0, 0);


          if (today < sessionDate) {

            return res.status(400).json({
              message: "Booking is not available yet for this tutor",
            });

          }

        }


        // SLOT CHECK

        const totalSlot =
          Number(tutor.totalSlot);


        if (
          !Number.isFinite(totalSlot) ||
          totalSlot <= 0
        ) {

          return res.status(400).json({
            message:
              "This session is fully booked. You can't join at the moment.",
          });

        }


        // DECREASE SLOT

        const slotUpdate =
          await tutorsCollection.findOneAndUpdate(

            {
              _id: tutorObjectId,
              totalSlot: { $gt: 0 },
            },

            {
              $inc: {
                totalSlot: -1,
                bookedCount: 1,
              },
            },

            {
              returnDocument: "after",
            }

          );


        if (!slotUpdate) {

          return res.status(400).json({
            message:
              "This session is fully booked. You can't join at the moment.",
          });

        }


        // CREATE BOOKING

        const booking = {

          userId,

          studentName:
            req.body.studentName ||
            req.user?.name ||
            "",

          studentEmail:
            req.body.studentEmail ||
            req.user?.email ||
            "",

          phone:
            req.body.phone ||
            "",

          tutorId: tutorId,

          tutorName:
            tutor.name,

          subject:
            tutor.subject,

          image:
            tutor.image ||
            "",

          status:
            "active",

          bookedAt:
            new Date(),

        };


        try {

          const result =
            await sessionCollection.insertOne(booking);


          return res.status(201).json({

            success: true,

            message:
              "Session booked successfully",

            booking: {
              ...booking,
              _id: result.insertedId,
            },

          });


        } catch (error) {


          // ROLLBACK SLOT IF BOOKING FAILS

          await tutorsCollection.updateOne(

            {
              _id: tutorObjectId,
            },

            {
              $inc: {
                totalSlot: 1,
                bookedCount: -1,
              },
            }

          );


          throw error;

        }


      } catch (error) {

        console.error(
          "Booking error:",
          error
        );


        return res.status(500).json({
          message:
            "Failed to book session",
        });

      }

    });


    // CANCEL BOOKING

    app.patch(
      "/booked-session/cancel/:sessionId",
      verifyToken,
      async (req, res) => {

        try {

          const { sessionId } =
            req.params;

          const userId =
            req.user?.sub ||
            req.user?.id;


          if (!ObjectId.isValid(sessionId)) {

            return res.status(400).json({
              message:
                "Invalid session ID",
            });

          }


          const sessionObjectId =
            new ObjectId(sessionId);


          // FIND USER'S BOOKING

          const booking =
            await sessionCollection.findOne({

              _id: sessionObjectId,

              userId,

            });


          if (!booking) {

            return res.status(404).json({
              message:
                "Booking not found",
            });

          }


          // DON'T CANCEL TWICE

          if (
            booking.status ===
            "cancelled"
          ) {

            return res.status(400).json({
              message:
                "Booking is already cancelled",
            });

          }


          // UPDATE BOOKING STATUS

          const updateResult =
            await sessionCollection.updateOne(

              {
                _id: sessionObjectId,

                userId,

                status: {
                  $ne: "cancelled"
                },

              },

              {
                $set: {

                  status:
                    "cancelled",

                  cancelledAt:
                    new Date(),

                },
              }

            );


          if (
            updateResult.modifiedCount !== 1
          ) {

            return res.status(400).json({
              message:
                "Booking could not be cancelled",
            });

          }


          // RESTORE SLOT

          if (
            booking.tutorId &&
            ObjectId.isValid(
              booking.tutorId
            )
          ) {

            await tutorsCollection.updateOne(

              {
                _id:
                  new ObjectId(
                    booking.tutorId
                  ),
              },

              {
                $inc: {

                  totalSlot:
                    1,

                  bookedCount:
                    -1,

                },
              }

            );

          }


          return res.json({

            success: true,

            message:
              "Booking cancelled successfully",

          });


        } catch (error) {

          console.error(
            "Cancellation error:",
            error
          );


          return res.status(500).json({
            message:
              "Failed to cancel booking",
          });

        }

      }
    );


  } finally {

  }
}


run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!');
});

module.exports = app;