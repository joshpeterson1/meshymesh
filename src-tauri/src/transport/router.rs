use std::fmt;

use meshtastic::packet::PacketRouter;
use meshtastic::protobufs::{FromRadio, MeshPacket};
use meshtastic::types::NodeId;
use tokio::sync::mpsc;

#[derive(Debug)]
pub struct RouterError(pub String);

impl fmt::Display for RouterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "RouterError: {}", self.0)
    }
}

impl std::error::Error for RouterError {}

pub struct EchoRouter {
    my_node_num: u32,
    echo_tx: mpsc::Sender<MeshPacket>,
}

impl EchoRouter {
    pub fn new(my_node_num: u32, echo_tx: mpsc::Sender<MeshPacket>) -> Self {
        Self {
            my_node_num,
            echo_tx,
        }
    }

    pub fn set_node_num(&mut self, num: u32) {
        self.my_node_num = num;
    }
}

impl PacketRouter<(), RouterError> for EchoRouter {
    fn handle_packet_from_radio(&mut self, _packet: FromRadio) -> Result<(), RouterError> {
        Ok(())
    }

    fn handle_mesh_packet(&mut self, packet: MeshPacket) -> Result<(), RouterError> {
        self.echo_tx
            .try_send(packet)
            .map_err(|e| RouterError(e.to_string()))?;
        Ok(())
    }

    fn source_node_id(&self) -> NodeId {
        self.my_node_num.into()
    }
}
