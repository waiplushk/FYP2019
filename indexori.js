const apiai = require("apiai");
const express = require("express");
const bodyParser = require("body-parser");
const uuid = require("uuid");
const axios = require('axios');
const app = express();
//Import Config file
const config = require("./config");

//setting Port
app.set("port", process.env.PORT || 5000);

//serve static files in the public directory
app.use(express.static("public"));

// Process application/x-www-form-urlencoded
app.use(
  bodyParser.urlencoded({
    extended: false
  })
);

// Process application/json
app.use(bodyParser.json());

// Index route
app.get("/", function (req, res) {
  res.send("Hello world, I am a chat bot");
});

// for Facebook verification
app.get("/webhook/", function (req, res) {
  console.log("request");
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === config.FB_VERIFY_TOKEN
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

// Spin up the server
app.listen(app.get("port"), function () {
  console.log("Magic Started on port", app.get("port"));
});

const apiAiService = apiai(config.API_AI_CLIENT_ACCESS_TOKEN, {
    language: "en",
    requestSource: "fb"
  });
  const sessionIds = new Map();

  app.post("/webhook/", function (req, res) {
    var data = req.body;
    // Make sure this is a page subscription
    if (data.object == "page") {
      // Iterate over each entry
      // There may be multiple if batched
      data.entry.forEach(function (pageEntry) {
        var pageID = pageEntry.id;
        var timeOfEvent = pageEntry.time;
   
        // Iterate over each messaging event
        pageEntry.messaging.forEach(function (messagingEvent) {
          if (messagingEvent.message) {
            receivedMessage(messagingEvent);
            console.log("webhook message");
            //console.log(sender);
          } else {
            console.log("Webhook received unknown messagingEvent: ", messagingEvent);
          }
        });
      });
      // Assume all went well.
      // You must send back a 200, within 20 seconds
      res.sendStatus(200);
    }
  });

  function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;
   
    if (!sessionIds.has(senderID)) {
      sessionIds.set(senderID, uuid.v1());
    }
   
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;
   
    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
   
    if (messageText) {
      //send message to api.ai
      sendToApiAi(senderID, messageText);
      console.log("receive message");
    } else if (messageAttachments) {
      handleMessageAttachments(messageAttachments, senderID);
    }
  }

  function sendToApiAi(sender, text) {
    sendTypingOn(sender);
    let apiaiRequest = apiAiService.textRequest(text, {
      sessionId: sessionIds.get(sender)
    });
   
    apiaiRequest.on("response", response => {
      if (isDefined(response.result)) {
        handleApiAiResponse(sender, response);
        console.log(response);
      }
    });
   
    apiaiRequest.on("error", error => console.error(error));
    apiaiRequest.end();
  }

  const sendTypingOn = (recipientId) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      sender_action: "typing_on"
    };
    callSendAPI(messageData);
  }

  const callSendAPI = async (messageData) => {
 
    const url = "https://graph.facebook.com/v3.2/me/messages?access_token=" + config.FB_PAGE_TOKEN;
      await axios.post(url, messageData)
        .then(function (response) {
          if (response.status == 200) {
            var recipientId = response.data.recipient_id;
            var messageId = response.data.message_id;
            if (messageId) {
              console.log(
                "Successfully sent message with id %s to recipient %s",
                messageId,
                recipientId
              );
            } else {
              console.log(
                "Successfully called Send API %s for recipient %s",
                messageId,
                recipientId
              );
            }
          }
        })
        .catch(function (error) {
            console.log("callsendapi error:");
          console.log(error.response.headers);
        });
    }

    const isDefined = (obj) => {
        if (typeof obj == "undefined") {
          return false;
        }
        if (!obj) {
          return false;
        }
        return obj != null;
      }

function handleApiAiResponse(sender, response) {
        let responseText = response.result.fulfillment.speech;
        let responseData = response.result.fulfillment.data;
        let messages = response.result.fulfillment.messages;
        let action = response.result.action;
        let contexts = response.result.contexts;
        let parameters = response.result.parameters;
       
        sendTypingOff(sender);
       
       if (responseText == "" && !isDefined(action)) {
          //api ai could not evaluate input.
          console.log("Unknown query" + response.result.resolvedQuery);
          sendTextMessage(
            sender,
            "I'm not sure what you want. Can you be more specific?"
          );
        } else if (isDefined(action)) {
          handleApiAiAction(sender, action, responseText, contexts, parameters);
        } else if (isDefined(responseData) && isDefined(responseData.facebook)) {
          try {
            console.log("Response as formatted message" + responseData.facebook);
            console.log(messages);
            sendTextMessage(sender, responseData.facebook);
          } catch (err) {
            sendTextMessage(sender, err.message);
          }
        } else if (isDefined(responseText)) {
          sendTextMessage(sender, responseText);
        }
      }

      const sendTypingOff = (recipientId) => {
        var messageData = {
          recipient: {
            id: recipientId
          },
          sender_action: "typing_off"
        };
       
        callSendAPI(messageData);
      }

      const sendTextMessage = async (recipientId, text) => {
        var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            text: text
          }
        };
        await callSendAPI(messageData);
      }

      function handleApiAiAction(sender, action, responseText, contexts, parameters) {
        switch (action) {
         case "send-text":
           //var responseText = "This is example of Text message."
           sendTextMessage(sender, responseText);
           break;
         default:
           //unhandled action, just send back the text
         sendTextMessage(sender, responseText);
       }
     }