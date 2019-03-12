const { callSendAPI } = require('./common')
const config = require("../config")
const request = require("request-promise");


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
  
  const sendGenericMessage = async (recipientId, elements) => {
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: elements
          }
        }
      }
    };
    await callSendAPI(messageData);
  }
