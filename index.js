const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const admin = require("firebase-admin");
// const serviceAccount = require("./assertverse-firebase-adminsdk.json");





const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);






admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 3000;

const stripe = require("stripe")(process.env.STRIPE_SECRET);

// middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers?.authorization;
  // console.log("=============--------------==========", token);

  if (!token) {
    return res.status(401).send({ message: "unauthzorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    // console.log("----------decoded----------", decoded);
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ova35yv.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // off this
    // await client.connect();

    const db = client.db("assetverse");
    const packagesCollection = db.collection("packages");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const requestsCollection = db.collection("requests");
    const assignedAssetsCollection = db.collection("assignedAssets");
    const employeeAffiliationsCollection = db.collection(
      "employeeAffiliations"
    );
    const paymentsCollection = db.collection("payments");

    const verifyHR = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "hr") {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      next();
    };

    const verifyEmployee = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "employee") {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      next();
    };

    app.get("/packages", async (req, res) => {
      try {
        const result = await packagesCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching packages:", error);
        return res.status(500).send({ message: "Failed to fetch packages" });
      }
    });

    // user related api
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        const email = user.email;
        const userExist = await usersCollection.findOne({ email });
        if (userExist) {
          return res.send({ message: "user already exist" });
        }

        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error("Error creating user:", error);
        return res.status(500).send({ message: "Failed to create user" });
      }
    });

    // get user role
    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;
      const query = { email };

      try {
        const user = await usersCollection.findOne(query);

        if (!user) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        res.send({ role: user.role });
      } catch (error) {
        console.error(error);

        return res.status(500).send({
          message: "Failed to fetch user role",
        });
      }
    });

    // get user
    app.get("/users", verifyFBToken, async (req, res) => {
      const { email } = req.query;
      const query = { email };

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      try {
        const result = await usersCollection.findOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get user" });
      }
    });

    // update employee profile
    app.patch("/update-employee-profile/:email", async (req, res) => {
      const { email } = req.params;
      const { displayName, dateOfBirth, photoURL } = req.body;

      try {
        await usersCollection.updateOne(
          { email },
          {
            $set: {
              displayName,
              dateOfBirth,
              photoURL,
              updatedAt: new Date(),
            },
          }
        );

        await Promise.all([
          employeeAffiliationsCollection.updateMany(
            { employeeEmail: email },
            { $set: { employeeName: displayName } }
          ),

          assignedAssetsCollection.updateMany(
            { employeeEmail: email },
            { $set: { employeeName: displayName } }
          ),

          requestsCollection.updateMany(
            { requesterEmail: email },
            { $set: { requesterName: displayName } }
          ),
        ]);

        res.status(200).send({
          message: "Employee profile updated successfully",
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          message: "Failed to update employee profile",
        });
      }
    });

    //update hr profile
    app.patch("/update-hr-profile/:email", async (req, res) => {
      const { email } = req.params;
      const { companyName, companyLogo, dateOfBirth } = req.body;

      try {
        await usersCollection.updateOne(
          { email },
          {
            $set: {
              companyName,
              companyLogo,
              dateOfBirth,
              updatedAt: new Date(),
            },
          }
        );

        await Promise.all([
          assetsCollection.updateMany(
            { hrEmail: email },
            { $set: { companyName } }
          ),

          employeeAffiliationsCollection.updateMany(
            { hrEmail: email },
            { $set: { companyName, companyLogo } }
          ),

          requestsCollection.updateMany(
            { hrEmail: email },
            { $set: { companyName } }
          ),
          assignedAssetsCollection.updateMany(
            { hrEmail: email },
            { $set: { companyName } }
          ),
        ]);

        res.status(200).send({
          message: "HR profile and company info updated successfully",
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update profile" });
      }
    });

    // ----------- assets related api --------------

    app.post("/assets", async (req, res) => {
      const asset = req.body;
      try {
        const result = await assetsCollection.insertOne(asset);
        res.status(201).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to add asset" });
      }
    });

    // get all asset from collection
    app.get("/assets-all", async (req, res) => {
      const email = req.query.email;
      const query = {};

      if (email) {
        query.hrEmail = email;
      }

      try {
        const result = await assetsCollection
          .find(query)
          .sort({ dateAdded: -1 })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Can't get assets" });
      }
    });

    // asset list
    app.get("/assets", verifyFBToken, verifyHR, async (req, res) => {
      try {
        const { email, searchText = "", page = 1, limit = 10 } = req.query;

        const pageNumber = parseInt(page);
        const pageSize = parseInt(limit);
        const skip = (pageNumber - 1) * pageSize;

        let query = {};

        if (email) {
          query.hrEmail = email;
        }

        if (searchText.trim()) {
          query.productName = { $regex: searchText, $options: "i" };
        }

        const totalAssets = await assetsCollection.countDocuments(query);

        const assets = await assetsCollection
          .find(query)
          .skip(skip)
          .limit(pageSize)
          .sort({ dateAdded: -1 })
          .toArray();

        res.status(200).send({
          totalAssets,
          currentPage: pageNumber,
          totalPages: Math.ceil(totalAssets / pageSize),
          assets,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to get assets" });
      }
    });

    app.delete("/assets/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await assetsCollection.deleteOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res
          .status(500)
          .send({ message: "Failed to delete asset", error: error.message });
      }
    });

    app.patch("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      try {
        const query = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            ...updatedData,
            updatedAt: new Date(),
          },
        };

        const result = await assetsCollection.updateOne(query, updatedDoc);
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to update asset" });
      }
    });

    // requests related api
    app.post("/requests", async (req, res) => {
      const request = req.body;
      try {
        const result = await requestsCollection.insertOne(request);
        res.status(201).send(result);
      } catch (error) {
        console.error("Failed to create request:", error);
        res.status(500).send({ message: "Failed to create request" });
      }
    });

    app.get("/requests", verifyFBToken, verifyHR, async (req, res) => {
      const { email } = req.query;
      try {
        const query = { hrEmail: email };
        const result = await requestsCollection
          .find(query)
          .sort({ requestDate: -1 })
          .toArray();
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "unable to get requests" });
      }
    });

    // approve request api
    app.patch("/requests/:id/approve", async (req, res) => {
      const requestId = req.params.id;
      const { hrEmail } = req.body;

      try {
        // get request
        const requestQuery = { _id: new ObjectId(requestId) };
        const request = await requestsCollection.findOne(requestQuery);

        if (request.requestStatus !== "pending") {
          return res.status(400).send({ message: "Request already processed" });
        }

        // check affiliation
        const affiliationQuery = {
          employeeEmail: request.requesterEmail,
          companyName: request.companyName,
        };
        const existingAffiliation =
          await employeeAffiliationsCollection.findOne(affiliationQuery);

        if (!existingAffiliation) {
          // get hrInfo
          const hrInfo = await usersCollection.findOne({ email: hrEmail });
          if (!hrInfo) {
            return res.status(404).send({ message: "HR not found" });
          }
          // enforce package limit
          if (hrInfo.currentEmployees >= hrInfo.packageLimit) {
            return res.status(404).send({
              message: "Package limit reached. Upgrade required.",
            });
          }
        }

        //  Deduct asset quantity-------
        const assetResult = await assetsCollection.updateOne(
          {
            _id: new ObjectId(request.assetId),
            availableQuantity: { $gt: 0 }, // check stock is 0>1
          },
          {
            $inc: { availableQuantity: -1 },
          }
        );

        if (assetResult.modifiedCount === 0) {
          return res.status(400).send({ message: "Asset not available" });
        }

        //  Create assigned asset
        const assetImageDoc = await assetsCollection.findOne(
          { _id: new ObjectId(request.assetId) },
          { projection: { productImage: 1, _id: 0 } }
        );

        const dataToAssign = {
          assetId: request.assetId,
          assetName: request.assetName,
          assetImage: assetImageDoc?.productImage,
          assetType: request.assetType,
          employeeEmail: request.requesterEmail,
          employeeName: request.requesterName,
          hrEmail: request.hrEmail,
          companyName: request.companyName,
          assignmentDate: new Date(),
          returnDate: null,
          status: "assigned",
        };
        await assignedAssetsCollection.insertOne(dataToAssign);

        // Create affiliation if first time
        if (!existingAffiliation) {
          const companyLogoDoc = await usersCollection.findOne(
            { email: hrEmail },
            { projection: { companyLogo: 1, _id: 0 } }
          );

          const affiliationData = {
            employeeEmail: request.requesterEmail,
            employeeName: request.requesterName,
            hrEmail: request.hrEmail,
            companyLogo: companyLogoDoc?.companyLogo,
            companyName: request.companyName,
            affiliationDate: new Date(),
            status: "active",
          };
          await employeeAffiliationsCollection.insertOne(affiliationData);

          // update currentEmployee
          await usersCollection.updateOne(
            { email: hrEmail },
            { $inc: { currentEmployees: 1 } }
          );
        }

        // update request status
        await requestsCollection.updateOne(
          { _id: new ObjectId(requestId) },
          {
            $set: {
              requestStatus: "approved",
              approvalDate: new Date(),
              processedBy: hrEmail,
            },
          }
        );

        res.status(200).send({ message: "Request approved successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Approval failed" });
      }
    });

    //assign directly
    app.post("/assign-directly", verifyFBToken, verifyHR, async (req, res) => {
      const { assetId, employeeEmail, employeeName, hrEmail, companyName } =
        req.body;

      try {
        // check asset availability
        const asset = await assetsCollection.findOne({
          _id: new ObjectId(assetId),
          hrEmail,
          availableQuantity: { $gt: 0 },
        });

        if (!asset) {
          return res.status(400).send({ message: "Asset not available" });
        }

        // deduct
        await assetsCollection.updateOne(
          { _id: asset._id },
          { $inc: { availableQuantity: -1 } }
        );

        // assign asset
        const assignedAsset = {
          assetId: asset._id,
          assetName: asset.productName,
          assetImage: asset.productImage,
          assetType: asset.productType,
          employeeEmail,
          employeeName,
          hrEmail,
          companyName,
          assignmentDate: new Date(),
          returnDate: null,
          status: "assigned",
        };

        await assignedAssetsCollection.insertOne(assignedAsset);

        res.status(200).send({ message: "Asset assigned successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Direct assignment failed" });
      }
    });

    // Reject Rquest
    app.patch("/requests/:id/reject", async (req, res) => {
      const requestId = req.params.id;
      try {
        const result = await requestsCollection.updateOne(
          { _id: new ObjectId(requestId), requestStatus: "pending" },
          {
            $set: {
              requestStatus: "rejected",
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(400)
            .send({ message: "Request already processed or not found" });
        }

        res.status(200).send({ message: "Request rejected successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Reject failed" });
      }
    });
    // ---------------------employee related api---------------------

    // get my-all-employees =========
    app.get("/employees", verifyFBToken, verifyHR, async (req, res) => {
      const { email } = req.query;

      try {
        const query = { hrEmail: email, status: "active" };
        const allEmployees = await employeeAffiliationsCollection
          .find(query)
          .toArray();

        const employeeEmails = allEmployees.map((emp) => emp.employeeEmail);
        const uniqueEmployeeEmails = [...new Set(employeeEmails)];

        const imageURLS = await Promise.all(
          uniqueEmployeeEmails.map((email) =>
            usersCollection.findOne(
              { email },
              { projection: { email: 1, photoURL: 1, _id: 0 } }
            )
          )
        );

        const assetCounts = await assignedAssetsCollection
          .aggregate([
            {
              $match: {
                status: "assigned",
                hrEmail: email,
              },
            },
            {
              $group: {
                _id: "$employeeEmail",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray();

        const assetCountMap = {};
        assetCounts.forEach((item) => {
          assetCountMap[item._id] = item.count;
        });

        const result = allEmployees.map((emp) => {
          const match = imageURLS.find(
            (img) => img?.email === emp.employeeEmail
          );

          return {
            ...emp,
            profileImage: match?.photoURL || null,
            assetCount: assetCountMap[emp.employeeEmail] || 0,
          };
        });

        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "unable to get employees" });
      }
    });

    // Remove Employee =======
    app.patch("/employees/:email/remove", async (req, res) => {
      const employeeEmail = req.params.email;
      const { hrEmail } = req.body;

      try {
        // get all active assigned assets
        const assignedAssetsQuery = {
          employeeEmail,
          hrEmail,
          status: "assigned",
        };
        const assignedAssets = await assignedAssetsCollection
          .find(assignedAssetsQuery)
          .toArray();

        // return each asset
        for (const asset of assignedAssets) {
          // increase available quantity for each asset
          await assetsCollection.updateOne(
            { _id: new ObjectId(asset.assetId) },
            { $inc: { availableQuantity: 1 } }
          );

          // mark asset as returned for each asset
          await assignedAssetsCollection.updateOne(
            { _id: asset._id },
            {
              $set: {
                status: "returned",
                returnDate: new Date(),
              },
            }
          );
        }

        // deleting affiliation
        const affiliationdeleteQery = {
          employeeEmail,
          hrEmail,
        };

        const deleteResult = await employeeAffiliationsCollection.deleteOne(
          affiliationdeleteQery
        );

        if (deleteResult.deletedCount === 0) {
          return res
            .status(404)
            .send({ message: "Employee affiliation not found" });
        }

        // change value of currentEmplyee for hr
        await usersCollection.updateOne(
          { email: hrEmail, currentEmployees: { $gt: 0 } },
          { $inc: { currentEmployees: -1 } }
        );

        res.status(200).send({
          message: "Employee removed and assets returned successfully",
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to remove employee" });
      }
    });

    // my assigned assets
    app.get("/my-asset", verifyFBToken, verifyEmployee, async (req, res) => {
      const { email, search, type } = req.query;

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      try {
        const query = { employeeEmail: email };

        if (search) {
          query.assetName = { $regex: search, $options: "i" };
        }

        if (type) {
          query.assetType = type;
        }

        const result = await assignedAssetsCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Can't fetch your assets" });
      }
    });

    //all the affiliated company
    app.get(
      "/my-companies",
      verifyFBToken,
      verifyEmployee,
      async (req, res) => {
        const { email } = req.query;

        try {
          const companies = await employeeAffiliationsCollection
            .find({ employeeEmail: email, status: "active" })
            .toArray();

          res.status(200).send(companies);
        } catch (error) {
          console.log(error);
          res.status(500).send({ message: "Can't Get Companies" });
        }
      }
    );

    // Team member per company
    app.get("/company-team", async (req, res) => {
      const { companyName } = req.query;

      try {
        const affiliations = await employeeAffiliationsCollection
          .find({ companyName, status: "active" })
          .toArray();

        if (affiliations.length === 0) {
          return res.status(200).send([]);
        }

        const emails = affiliations.map((a) => a.employeeEmail);

        const users = await usersCollection
          .find(
            { email: { $in: emails } },
            {
              projection: {
                displayName: 1,
                email: 1,
                photoURL: 1,
                dateOfBirth: 1,
              },
            }
          )
          .toArray();

        res.status(200).send(users);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Can't get team members" });
      }
    });

    // asset type for analytics
    app.get("/asset-types", verifyFBToken, verifyHR, async (req, res) => {
      try {
        const hrEmail = req.query.email;

        const result = await assetsCollection
          .aggregate([
            { $match: { hrEmail } },
            {
              $group: {
                _id: "$productType",
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                type: "$_id",
                count: 1,
              },
            },
          ])
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ message: "Failed to load asset type analytics" });
      }
    });

    // top 5 requested asset
    app.get("/top-assets", verifyFBToken, verifyHR, async (req, res) => {
      try {
        const hrEmail = req.query.email;

        const result = await requestsCollection
          .aggregate([
            { $match: { hrEmail } },
            {
              $group: {
                _id: "$assetName",
                requests: { $sum: 1 },
              },
            },
            { $sort: { requests: -1 } },
            { $limit: 5 },
            {
              $project: {
                _id: 0,
                name: "$_id",
                requests: 1,
              },
            },
          ])
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ message: "Failed to load top assets analytics" });
      }
    });

    //====================== pyment related api=======================

    app.post("/payment-checkout-session", verifyFBToken, async (req, res) => {
      const { hrEmail, packageName, employeeLimit, amount } = req.body;

      if (hrEmail !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      //create pending payment record
      const pendingPayment = {
        hrEmail,
        packageName,
        employeeLimit,
        amount,
        status: "pending",
        paymentDate: new Date(),
      };

      const paymentResult = await paymentsCollection.insertOne(pendingPayment);

      // create Stripe session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],

        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount * 100,
              product_data: {
                name: `${packageName} Package`,
              },
            },
            quantity: 1,
          },
        ],

        customer_email: hrEmail,

        metadata: {
          paymentId: paymentResult.insertedId.toString(),
          packageName,
          employeeLimit,
          hrEmail,
        },

        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled?paymentId=${paymentResult.insertedId}`,
      });

      res.send({ url: session.url });
    });

    //payment success
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        return res.send({ success: false });
      }

      const transactionId = session.payment_intent;
      const { packageName, employeeLimit, hrEmail } = session.metadata;

      // prevent duplicate processing
      const existingPayment = await paymentsCollection.findOne({
        transactionId,
      });
      if (existingPayment) {
        return res.send({
          packageName: existingPayment.packageName,
          employeeLimit: existingPayment.employeeLimit,
          amount: existingPayment.amount,
          transactionId: existingPayment.transactionId,
          status: existingPayment.status,
        });
      }

      const paymentDoc = {
        hrEmail,
        packageName,
        employeeLimit: Number(employeeLimit),
        amount: session.amount_total / 100,
        transactionId,
        status: "completed",
        paymentDate: new Date(),
      };

      // save payment
      await paymentsCollection.insertOne(paymentDoc);

      // update HR subscription
      await usersCollection.updateOne(
        { email: hrEmail },
        {
          $set: {
            subscription: packageName,
            packageLimit: Number(employeeLimit),
          },
        }
      );

      res.send({
        packageName: paymentDoc.packageName,
        employeeLimit: paymentDoc.employeeLimit,
        amount: paymentDoc.amount,
        transactionId: paymentDoc.transactionId,
        status: paymentDoc.status,
      });
    });

    //payment fail
    app.patch("/payment-cancelled", async (req, res) => {
      const { paymentId } = req.body;

      if (!paymentId) {
        return res.status(400).send({ message: "paymentId is required" });
      }

      let objectId;
      try {
        objectId = new ObjectId(paymentId);
      } catch (error) {
        return res.status(400).send({ message: "Invalid paymentId" });
      }

      const result = await paymentsCollection.updateOne(
        { _id: objectId },
        { $set: { status: "failed", paymentDate: new Date() } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Payment not found" });
      }

      res.send({ success: true });
    });

    // get payment history for HR
    app.get("/payments", verifyFBToken, verifyHR, async (req, res) => {
      const { email } = req.query;

      try {
        const payments = await paymentsCollection
          .find({ hrEmail: email })
          .sort({ paymentDate: -1 })
          .toArray();

        res.status(200).send(payments);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to load payment history" });
      }
    });

    // off this
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("AssetVerse Server is Running !");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
